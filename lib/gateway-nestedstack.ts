import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { GatewayStrongswan } from './gateway-strongswan';
import * as gwc from './vpn-config';
import { NagSuppressions } from 'cdk-nag';

export class GatewayNestedStack extends cdk.NestedStack {
    readonly gateway: GatewayStrongswan;

    constructor(scope: Construct, id: string, 
        vpc: ec2.Vpc, subnets: ec2.SubnetSelection,
        vpn: ec2.CfnVPNConnection, gatewayIP: cdk.aws_ec2.CfnEIP, 
        props?: cdk.StackProps) {
        super(scope, id, props);

        const conf = this.node.tryGetContext('configuration');
        const onPremConf = conf.onPremises;

        // Retreive vpn configuration for gateway cloudformation template
        const gwConf = new gwc.VPNConfig(this, 'gwConfig', {
            vpnId: vpn.ref,
        });

        const tunnel1PSK = new secretsmanager.Secret(this, 'tunnel1PSK', {
            secretObjectValue: {
                psk: cdk.SecretValue.unsafePlainText(gwConf.getConfig(1, 'ike', 'pre_shared_key'))
            }
        });
        NagSuppressions.addResourceSuppressions(tunnel1PSK, [
            {id: 'AwsSolutions-SMG4', reason: 'preShared keys are an external secrets that cannot be rotated automatically'}
        ]);

        const tunnel2PSK = new secretsmanager.Secret(this, 'tunnel2PSK', {
            secretObjectValue: {
                psk: cdk.SecretValue.unsafePlainText(gwConf.getConfig(2, 'ike', 'pre_shared_key'))
            }
        });
        NagSuppressions.addResourceSuppressions(tunnel2PSK, [
            {id: 'AwsSolutions-SMG4', reason: 'preShared keys are an external secrets that cannot be rotated automatically'}
        ]);

        //Alias for brevity
        const c = gwConf;
        this.gateway = new GatewayStrongswan(this, 'gateway', {templateParams: {
            'pAuthType': 'psk',
            'pTunnel1PskSecretName': tunnel1PSK.secretName,
            'pTunnel1VgwOutsideIpAddress': c.getConfig(1, 'vgw', 'tunnel_outside_address.ip_address'),
            'pTunnel1CgwInsideIpAddress': c.getConfig(1, 'cgw', 'tunnel_inside_address.ip_address') +
                '/' + c.getConfig(1, 'cgw', 'tunnel_inside_address.network_cidr'),
            'pTunnel1VgwInsideIpAddress': c.getConfig(1, 'vgw', 'tunnel_inside_address.ip_address') +
                '/' + c.getConfig(1, 'vgw', 'tunnel_inside_address.network_cidr'),
            'pTunnel1VgwBgpAsn': c.getConfig(1, 'vgw', 'bgp.asn'),
            'pTunnel1BgpNeighborIpAddress': c.getConfig(1, 'vgw', 'tunnel_inside_address.ip_address'),
            'pTunnel2PskSecretName': tunnel2PSK.secretName,
            'pTunnel2VgwOutsideIpAddress': c.getConfig(2, 'vgw', 'tunnel_outside_address.ip_address'),
            'pTunnel2CgwInsideIpAddress': c.getConfig(2, 'cgw', 'tunnel_inside_address.ip_address') +
                '/' + c.getConfig(2, 'cgw', 'tunnel_inside_address.network_cidr'),
            'pTunnel2VgwInsideIpAddress': c.getConfig(2, 'cgw', 'tunnel_inside_address.ip_address') +
                '/' + c.getConfig(2, 'vgw', 'tunnel_inside_address.network_cidr'),
            'pTunnel2VgwBgpAsn': c.getConfig(2, 'vgw', 'bgp.asn'),
            'pTunnel2BgpNeighborIpAddress': c.getConfig(2, 'vgw', 'tunnel_inside_address.ip_address'),
            'pEipAllocationId': gatewayIP.attrAllocationId,
            'pLocalBgpAsn': onPremConf.ASN,
            'pVpcId': vpc.vpcId,
            'pVpcCidr': vpc.vpcCidrBlock,
            'pSubnetId': vpc.selectSubnets(subnets).subnets[0].subnetId,
        }});
    }
}