import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { NetworkNestedStack } from './network-nestedstack';
import { GatewayNestedStack } from './gateway-nestedstack';
import { RoutesNestedStack } from './routes-nestedstack';
import { VPNNestedStack } from './vpn-nestedstack';
import { NagSuppressions } from 'cdk-nag';

export class VpnSimStack extends cdk.Stack {
    readonly onPremVPC: ec2.Vpc;
    readonly cloudVPC: ec2.Vpc;
    readonly onPremSubnets: ec2.SubnetSelection;
    readonly cloudSubnets: ec2.SubnetSelection;
    readonly gatewaySubnets: ec2.SubnetSelection;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const network = new NetworkNestedStack(this, 'network', 
            ec2.SubnetType.PRIVATE_WITH_EGRESS, ec2.SubnetType.PRIVATE_WITH_EGRESS);
        this.onPremVPC = network.onPremVPC;
        this.cloudVPC = network.cloudVPC;
        this.onPremSubnets = network.onPremSubnets;
        this.cloudSubnets = network.cloudSubnets;
        this.gatewaySubnets = {subnetType: ec2.SubnetType.PUBLIC};

        const vpn = new VPNNestedStack(this, 'vpn', this.cloudVPC, this.cloudSubnets);
        vpn.addDependency(network);

        const gateway = new GatewayNestedStack(this, 'gateway', 
            this.onPremVPC, this.gatewaySubnets, vpn.vpn, vpn.gatewayIP);
        gateway.addDependency(vpn);
        //Suppresing Rules for AWS Custom Resource Constructs
        NagSuppressions.addResourceSuppressionsByPath(this, '/VpnSimStack/gateway', [
            {id: 'AwsSolutions-IAM4', reason: 'AWS CDK built-in Construct cdk.custom_resources.AwsCustomResource'},
            {id: 'AwsSolutions-L1', reason: 'AWS CDK built-in Construct cdk.custom_resources.AwsCustomResource'}
        ], true);

        const routes = new RoutesNestedStack(this, 'routes', 
            this.onPremVPC, this.onPremSubnets, 
            this.cloudVPC, this.cloudSubnets, 
            vpn.transitGateway, gateway.gateway.gatewayPrimaryEniId);
        routes.addDependency(vpn);
        routes.addDependency(gateway);
    }
}
