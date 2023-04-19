#!/usr/bin/env node
import 'source-map-support/register';
import { App, Aspects } from 'aws-cdk-lib';
import { VpnSimStack } from '../lib/vpn-sim-stack';
import { ComputeStack } from '../lib/compute-stack';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';

const app = new App();
const vpnSimStack = new VpnSimStack(app, 'VpnSimStack');
const cloudSubnets = vpnSimStack.cloudVPC.selectSubnets(vpnSimStack.cloudSubnets).subnets;
const onPremSubnets = vpnSimStack.onPremVPC.selectSubnets(vpnSimStack.onPremSubnets).subnets;
const computeStack = new ComputeStack(app, 'ComputeStack', [{
  vpc: vpnSimStack.onPremVPC,
  subnets: vpnSimStack.onPremSubnets,
  instanceName: 'OnPremInstance',
  pingFromCidr: cloudSubnets.map(({ ipv4CidrBlock }) => ipv4CidrBlock)
},
{
  vpc: vpnSimStack.cloudVPC,
  subnets: vpnSimStack.cloudSubnets,
  instanceName: 'CloudInstance',
  pingFromCidr: onPremSubnets.map(({ ipv4CidrBlock }) => ipv4CidrBlock)
}]);
computeStack.addDependency(vpnSimStack);

Aspects.of(app).add(new AwsSolutionsChecks());

NagSuppressions.addStackSuppressions(computeStack, [
  {id: 'AwsSolutions-IAM4', reason: 'Standard Service Manager Policies, Not to be used in production'},
  {id: 'AwsSolutions-EC28', reason: 'Instance to temporary test VPN, no detail monitoring is needed, Not to be used in production'},
  {id: 'AwsSolutions-EC29', reason: 'Instance to temporary test VPN, storage is not being used, Not to be used in production'},
]);
