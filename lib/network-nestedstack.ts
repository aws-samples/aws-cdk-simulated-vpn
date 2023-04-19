import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from "aws-cdk-lib/aws-logs";
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface StandardVpcProps {
    cidr: string,
    maxAzs: number,
    computeSubnetType: ec2.SubnetType, 
    logGroup: logs.LogGroup
}

export class StandardVpc extends Construct {
    readonly vpc: ec2.Vpc;
    readonly securityGroup: ec2.SecurityGroup;

    constructor(scope: Construct, id: string, props: StandardVpcProps) {
        super(scope, id);

        this.vpc = new ec2.Vpc(this, 'vpc', {
            ipAddresses: ec2.IpAddresses.cidr(props.cidr),
            maxAzs: props.maxAzs,
            subnetConfiguration: [{
                name: props.computeSubnetType,
                subnetType: props.computeSubnetType,
                cidrMask: 24, 
            }, 
            {
                name: 'public',
                subnetType: ec2.SubnetType.PUBLIC,
                cidrMask: 24,          
            }],
            flowLogs: {
                'cwLogs': {
                    destination: ec2.FlowLogDestination.toCloudWatchLogs(props.logGroup),
                    trafficType: ec2.FlowLogTrafficType.ALL
                }
            }
        });

        if (props.computeSubnetType === ec2.SubnetType.PRIVATE_ISOLATED) {
            //Allow SSM endpoints to run session manager on isolated subnets
            // create security group for ssm endpoints 
            const ssmSecurityGroup = new ec2.SecurityGroup(this, `ssm-sg`, {
                vpc: this.vpc,
                description: "Allow port 443 from private instance",
                allowAllOutbound: true
            });
        
            ssmSecurityGroup.addIngressRule(
                ec2.Peer.anyIpv4(),
                ec2.Port.tcp(443),
                "allow HTTPS from private ec2 "
            );
        
            // add ssm vpc interface endpoint 
            this.vpc.addInterfaceEndpoint("Ssmthis.vpcEndpoint", {
                service: ec2.InterfaceVpcEndpointAwsService.SSM,
                securityGroups: [ssmSecurityGroup]
            });
        
            // add ssmmessage interface endpoint 
            this.vpc.addInterfaceEndpoint("SsmMessageEndpoint", {
                service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
                securityGroups: [ssmSecurityGroup]
            });
        
            // add ec2ssmmessage interface endpoint 
            this.vpc.addInterfaceEndpoint("Ec2SsmEndpoint", {
                service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
                securityGroups: [ssmSecurityGroup]
            });
        
            // add ec2s3 gateway endpoint to support yum
            this.vpc.addGatewayEndpoint('Ec2S3Endpoint', {
                service: ec2.GatewayVpcEndpointAwsService.S3,
            });
        }
    }
}

export class NetworkNestedStack extends cdk.NestedStack {
    readonly onPremVPC: ec2.Vpc;
    readonly cloudVPC: ec2.Vpc;
    readonly onPremSubnets: ec2.SubnetSelection;
    readonly cloudSubnets: ec2.SubnetSelection;

    constructor(scope: Construct, id: string, onPremSubnetType: ec2.SubnetType, 
        cloudSubnetType: ec2.SubnetType, props?: cdk.StackProps) {
        super(scope, id, props);

        const conf = this.node.tryGetContext('configuration');
        const { org, envPurpose } = conf.env;
        const onPremConf = conf.onPremises;
        const cloudConf = conf.cloud;

        const cwLogs = new logs.LogGroup(this, 'Log', {
            logGroupName: '/aws/vpc/flowlogs',
        });   

        // 1. Setting up network
        this.onPremVPC = new StandardVpc(this,
            `${org}-${envPurpose}-${onPremConf.name}`, {
            cidr: onPremConf.cidr,
            maxAzs: onPremConf.maxAzs,
            computeSubnetType: onPremSubnetType,
            logGroup: cwLogs
        }).vpc;
        this.onPremSubnets = {subnetType: onPremSubnetType};

        this.cloudVPC = new StandardVpc(this,
            `${org}-${envPurpose}-${cloudConf.name}`, {
            cidr: cloudConf.cidr,
            maxAzs: cloudConf.maxAzs,
            computeSubnetType: cloudSubnetType,
            logGroup: cwLogs
        }).vpc;
        this.cloudSubnets = {subnetType: cloudSubnetType};
    }
}
