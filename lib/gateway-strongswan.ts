import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as cfi from 'aws-cdk-lib/cloudformation-include';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export interface GatewayConfigProps {
    templateParams: any, 
}

export class GatewayStrongswan extends Construct {
    readonly gatewayInstance: cdk.aws_ec2.CfnInstance;
    readonly gatewayPrimaryEniId: string;

    constructor(scope: Construct, id: string, props: GatewayConfigProps) {
        super(scope, id);

        //Reused CloudFormation Template for an already published AWS Blog https://aws.amazon.com/blogs/networking-and-content-delivery/simulating-site-to-site-vpn-customer-gateways-strongswan/
        const template = new cfi.CfnInclude(this, 'GatewayTemplate', {
            templateFile: './lib/runtime/cloudformation/vpn-gateway-strongswan.yaml',
            parameters: props.templateParams,
        });
        NagSuppressions.addResourceSuppressions(template, [
            {id: 'AwsSolutions-IAM4', reason: 'Standard CloudWatch and Service Manager Policies, Not to be used in production'},
            {id: 'AwsSolutions-EC28', reason: 'Instance to simulate customer gateway using strongSwan, no detail monitoring is needed, Not to be used in production'},
            {id: 'AwsSolutions-EC29', reason: 'Instance to simulate customer gateway using strongSwan, storage is not being used, Not to be used in production'},
            {id: 'AwsSolutions-IAM5', reason: 'Policies specify the resource but wildcards are being used for subresources within'},
            {id: 'CdkNagValidationFailure', reason: 'This resouce use intrinsec functions and parameters to setup the stack'},
        ], true);

        this.gatewayInstance = template.getResource('rVpnGateway') as ec2.CfnInstance;

        new cdk.CfnOutput(this, 'Gateway', {
            value: this.gatewayInstance.ref,
            description: 'Gateway Instance'
        });

        // Retreive gateway primary ENI
        const awsService = new cr.AwsCustomResource(this, 'GetPrimaryENI', {
            installLatestAwsSdk: true, 
            onUpdate: {
                service: 'EC2',
                action: 'describeNetworkInterfaces',
                outputPaths: ['NetworkInterfaces.0.NetworkInterfaceId'],
                parameters: {
                    Filters: [
                        {
                            Name: 'attachment.instance-id',
                            Values: [this.gatewayInstance.ref]
                        }]
                },
                physicalResourceId: cr.PhysicalResourceId.of(`${this.gatewayInstance.ref}-primaryENI`),
            },
            policy: cr.AwsCustomResourcePolicy.fromStatements([
                new iam.PolicyStatement({ // Restrict to listing and describing tables
                    actions: ['EC2:DescribeNetworkInterfaces'],
                    resources: [this.gatewayInstance.ref],
                })
            ]),
        });

        this.gatewayPrimaryEniId = awsService.getResponseField('NetworkInterfaces.0.NetworkInterfaceId');

        new cdk.CfnOutput(this, 'GatewayPrimaryEni', {
            value: this.gatewayInstance.ref,
            description: 'Gateway primary network interface'
        });
    }
}