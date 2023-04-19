import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface SimpleInstanceProps {
    vpc: ec2.Vpc,
    subnets: ec2.SubnetSelection,
    instanceName: string,
    pingFromCidr?: string[]
}

export class SimpleInstance extends Construct {
    readonly instance: cdk.aws_ec2.Instance;

    constructor(scope: Construct, id: string,
        props: SimpleInstanceProps) {
        super(scope, id);

        const instSecurityGroup = new ec2.SecurityGroup(this, 'instance-sg', {
            vpc: props.vpc,
        });

        props.pingFromCidr?.forEach(cidr => {
            instSecurityGroup.addIngressRule(
                ec2.Peer.ipv4(cidr),
                ec2.Port.allIcmp(),
            );
        });

        // The EC2 instance using Amazon Linux 2
        this.instance = new ec2.Instance(this, 'instance', {
            vpc: props.vpc,
            instanceName: `${props.instanceName}`,
            instanceType: ec2.InstanceType.of(
                ec2.InstanceClass.T2,
                ec2.InstanceSize.MICRO
            ),
            machineImage: ec2.MachineImage.latestAmazonLinux({
                generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
            }),
            vpcSubnets: props.subnets,
            securityGroup: instSecurityGroup,
        })

        // Add the policy to access EC2 without SSH
        this.instance.role.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
        )
    }
}

export class ComputeStack extends cdk.Stack {
    readonly instance: cdk.aws_ec2.Instance;

    constructor(scope: Construct, id: string,
        multipleInstancesProps: SimpleInstanceProps[],
        props?: cdk.StackProps) {
        super(scope, id, props);

        multipleInstancesProps.forEach((instanceProps, index) => {
            const instance = new SimpleInstance(this, `simple-instance-${index}`, instanceProps);
        });
   }
}