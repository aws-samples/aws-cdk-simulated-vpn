const AWS = require('aws-sdk');
const parseString = require('xml2js').parseString;

function flattenObject(ob) {
    var res = {};
    (function recurse(obj, current) {
      for(var key in obj) {
        var value = obj[key];
        var newKey = (current ? current + "." + key : key);  // joined key with dot
        if(value && typeof value === "object") {
          recurse(value, newKey);  // it's a nested object, so do it again
        } else {
          res[newKey] = value;  // it's not an object, so set the property
        }
      }
    })(ob);
    return res;
}

function filterKeys(object, pred) {
    return Object.entries(object)
      .reduce(
        (acc, [k, v]) => pred(k)
          ? { ...acc, [k]: v }
          : acc,
        {},
      );
}

function startsWithOneOf(searchStrings) {
    return function(string) {
        for (const searchString of searchStrings) {
            if (string.startsWith(searchString)) {
                return true;
            }
        }
        return false;
    };
}

exports.handler = async (event, context) => {
    console.log('EVENT', event);
    //Ignore Deletes
    if (event.RequestType === 'Delete') return {PhysicalResourceId: event.PhysicalResourceId};

    //vpnId must be defined
    if (!(event.ResourceProperties && event.ResourceProperties.vpnId)) 
        throw new Error('vpnId is not provided');
    
    const vpnId = event.ResourceProperties.vpnId;
    const outputPaths = event.ResourceProperties.outputPaths;

    AWS.config.update({region: process.env.AWS_REGION});
    
    // Create EC2 service object
    var ec2 = new AWS.EC2({apiVersion: '2016-11-15'});

    var params = {
        VpnConnectionIds: [vpnId]
    };

    console.log('describing VPN', vpnId);
    const promise = new Promise(function(resolve, reject) {
        ec2.describeVpnConnections(params, function(err, response) {
            if (err) return reject(err);
            console.log('SUCCESS response: ', JSON.stringify(response));
    
            const xmlData = response.VpnConnections[0].CustomerGatewayConfiguration;
    
            // parsing xml data
            parseString(xmlData, {explicitArray: false}, function (err, results) {
                if (err) return reject(err);
                // console.log(JSON.stringify(results));
                
                resolve(results);
            });
        });
    });

    const rawResponse = await promise;
    const flatData = flattenObject(rawResponse);
    var data;

    if (outputPaths) {
        data = filterKeys(flatData, startsWithOneOf(outputPaths));
    } else {
        data = flatData;
    }
    const response = {
        Data: data
    }

    console.log('DATA ', response);
    return response;
};
