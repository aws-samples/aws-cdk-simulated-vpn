import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class RoutesNestedStack extends cdk.NestedStack {
    constructor(scope: Construct, id: string, 
        onPremVPC: ec2.Vpc, onPremSubnets: ec2.SubnetSelection,
        cloudVPC: ec2.Vpc, cloudSubnets: ec2.SubnetSelection, 
        transitGateway: ec2.CfnTransitGateway, gatewayEniId: string, 
        props?: cdk.StackProps) {
        super(scope, id, props);

        //Route OnPrem traffic to Transit Gateway
        cloudVPC.selectSubnets(cloudSubnets).subnets
            .forEach(({ routeTable: { routeTableId } }, index) => {
            new ec2.CfnRoute(this, 'to-onprem-route' + index, {
                destinationCidrBlock: onPremVPC.vpcCidrBlock,
                routeTableId,
                transitGatewayId: transitGateway.ref,
            });
        });
    
        //Route Cloud traffict to the Primary ENI from gateway
        onPremVPC.selectSubnets(onPremSubnets).subnets
            .forEach(({ routeTable: { routeTableId } }, index) => {
            new ec2.CfnRoute(this, 'to-cloud-route' + index, {
                destinationCidrBlock: cloudVPC.vpcCidrBlock,
                routeTableId, 
                networkInterfaceId: gatewayEniId,
            });
        });
    }
}