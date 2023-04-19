import * as cdk from 'aws-cdk-lib';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export interface GatewayConfigProps {
    vpnId: string;
}

export enum GatewayTunnelPrefix {
    tunnel1 = 'vpn_connection.ipsec_tunnel.0',
    tunnel2 = 'vpn_connection.ipsec_tunnel.1'
};

export enum GatewayTunnelConfig {
    cgw = 'customer_gateway',
    vgw = 'vpn_gateway',
    ike = 'ike'
}

export class VPNConfig extends Construct {
    readonly customResource: cdk.CustomResource;

    constructor(scope: Construct, id: string, props: GatewayConfigProps) {
        super(scope, id);

        // Create a policy to describe VPN
        const describeVpnPolicy = new iam.Policy(this, 'ec2-describeVpn', {
            statements: [
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: ['ec2:DescribeVpnConnections'],
                    resources: [props.vpnId],
                }),
            ],
        });

        const role = new iam.Role(this, 'describeVPNRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
          });

        const fn = new lambda.SingletonFunction(this, 'GwConfigSingleton', {
            uuid: '16b62807-000c-4985-a351-c8ef120e209b',
            code: lambda.Code.fromAsset('./lib/runtime/describeGatewayConfig'),
            handler: 'index.handler',
            runtime: lambda.Runtime.NODEJS_16_X,
            role: role
        });

        // attach the Policy to the function role
        role.attachInlinePolicy(describeVpnPolicy);

        const provider = new cr.Provider(this, 'GwConfigProvider', {
            onEventHandler: fn,
        });
        NagSuppressions.addResourceSuppressions(provider, [
            {id: 'AwsSolutions-IAM4', reason: 'AWS CDK built-in Construct cdk.custom_resources.Provider'},
            {id: 'AwsSolutions-IAM5', reason: 'Grant permission to all versions/aliases of the specified function ARN'},
            {id: 'AwsSolutions-L1', reason: 'AWS CDK built-in Construct cdk.custom_resources.Provider'}
        ], true);

        var paths: string[] = [];
        Object.values(GatewayTunnelPrefix).forEach(tunnel => 
            paths.push(...Object.values(GatewayTunnelConfig).map(conf => `${tunnel}.${conf}`))
        );

        this.customResource = new cdk.CustomResource(this, 'GwConfigResource', {
            serviceToken: provider.serviceToken,
            properties: {
                vpnId: props.vpnId,
                outputPaths: paths,
            },
        });
    }

    public getResponseField(dataPath: string): cdk.Reference {
        return this.customResource.getAtt(dataPath);
    }

    public getConfig(tunnel: number, section: string, config: string): string {
        var prefix, group;
        
        switch (tunnel) {
            case 1: prefix = GatewayTunnelPrefix.tunnel1; break;
            case 2: prefix = GatewayTunnelPrefix.tunnel2; break;
            default: throw new Error('Illegal argument');
        }

        switch (section) {
            case 'cgw': group = GatewayTunnelConfig.cgw; break;
            case 'vgw': group = GatewayTunnelConfig.vgw; break;
            case 'ike': group = GatewayTunnelConfig.ike; break;
            default: throw new Error('Illegal argument');
        }

        return this.customResource.getAttString(`${prefix}.${group}.${config}`);
    }
}