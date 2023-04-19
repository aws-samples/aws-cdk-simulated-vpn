import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class VPNNestedStack extends cdk.NestedStack {
    readonly transitGateway: ec2.CfnTransitGateway;
    readonly vpn: ec2.CfnVPNConnection;
    readonly gatewayIP: cdk.aws_ec2.CfnEIP;
    readonly customerGateway: cdk.aws_ec2.CfnCustomerGateway;
    readonly attachment: cdk.aws_ec2.CfnTransitGatewayAttachment;

    constructor(scope: Construct, id: string, 
        vpc: ec2.Vpc, subnets: ec2.SubnetSelection, 
        props?: cdk.StackProps) {
        super(scope, id, props);

        const conf = this.node.tryGetContext('configuration');
        const onPremConf = conf.onPremises;

        this.transitGateway = new ec2.CfnTransitGateway(this, 'tgw');

        this.gatewayIP = new ec2.CfnEIP(this, 'eip');

        this.customerGateway = new ec2.CfnCustomerGateway(this, 'cgw', {
            bgpAsn: onPremConf.ASN,
            ipAddress: this.gatewayIP.ref,
            type: 'ipsec.1'
        });

        this.vpn = new ec2.CfnVPNConnection(this, 'vpn', {
            transitGatewayId: this.transitGateway.ref,
            customerGatewayId: this.customerGateway.ref,
            staticRoutesOnly: false,
            type: 'ipsec.1',
        });

        this.attachment = new ec2.CfnTransitGatewayAttachment(this, 'tgw-attach', {
            subnetIds: vpc.selectSubnets(subnets).subnetIds,
            transitGatewayId: this.transitGateway.ref,
            vpcId: vpc.vpcId,
        });
    }
}