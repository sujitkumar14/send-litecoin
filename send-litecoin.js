var litecore=  require('litecore-lib');
var requestPromise = require('request-promise');
var bluebird = require('bluebird');
var BigNumber = require('bignumber.js');


const testnetAPI = 'https://testnet.litecore.io/api';
const livenetAPI = 'https://litecore.io/api';

var blockchainApi;

/**
 * retrieve Utxos from blockchain
 * @param address
 * @returns {Object}- promise object- utxos of address
 */
var retrieveUtxos = function (address) {

    return new bluebird.Promise(function (resolve, reject) {

        var url = blockchainApi+'/addr/' + address + '/utxo';

        requestPromise(url)
            .then(function (utxos) {
                utxos = JSON.parse(utxos);
                utxos.sort(function(a, b) {
                    return b.satoshis - a.satoshis;
                });
                resolve(utxos);
            })
            .catch(function (err) {
                reject(err);
            });

    });
};



/**
* retrieve utxos for particular amount
* @param address
* @param {Number} amount
* @returns {Object} - promise - utxos
*/
var utxosForAmount = function (address, amount) {
	return new bluebird.Promise(function (resolve, reject) {
		retrieveUtxos(address)
		.then(function (utxos) {
			var result = findUtxos(utxos, 0, amount, []);
			if(!result)
				return reject({"success": false, "error": "Not enough utxos"});

			resolve(result);
		})
		.catch(function (err) {
			reject(err);
		});
	});
};

/**
* recursive algorithm to find utxos for amount
* @param utxos - list of utxos
* @param pos - starting position
* @param amount - sum of utxos should be of this amount
* @param result - final list of utxos
* @returns {*} - returns result
*/
var findUtxos = function (utxos, pos, amount , result) {
	if(pos >= utxos.length)
		return null;

	var utxo = utxos[pos];
	result.push(utxo);
	if(utxo.satoshis >= amount){
		return result;
	}
	else{
		amount = amount - utxo.satoshis;
		return findUtxos(utxos, pos+1, amount, result);
	}
};


/**
 * function to retrieve current fee from blockchain
 * @param blocks - transaction will mine before or on this block after tx
 * @returns {*} - returns the fee in satoshis
 */
var getFee = function (blocks) {
    return new bluebird.Promise(function (resolve, reject) {
       var url = blockchainApi+'/utils/estimatefee?nbBlocks='+blocks;
        requestPromise(url)
            .then(function (fee) {
                fee = JSON.parse(fee);
                var txFee = safeMaths(fee[blocks],'*','100000000');
                resolve(txFee);
            })
            .catch(function (err) {
                reject(err);
            });
    });
};


/**
 * function to broadcast the tx
 * @param rawTx - raw tx
 * @returns {*} - returns the result of broadcast
 */
var sendRawTx = function (rawTx) {
    return new bluebird.Promise(function (resolve, reject) {
        var options = {
            method: 'POST',
            uri: blockchainApi + '/tx/send',
            body: {
                rawtx: rawTx
            },
            json: true // Automatically stringifies the body to JSON
        };
        requestPromise(options)
            .then(function (data) {
                resolve(data);
            })
            .catch(function (err) {
                reject(err);
            });
    });
};


/**
 * function for safe maths , converts arguments in bigNumber and perform operations
 * @param first - first Number in string
 * @param operation - operation symbol
 * @param sec - second number in String
 * @returns {string} - returns the result in string
 */

var safeMaths = function(first, operation, sec) {

    first = first.toString();
    sec = sec.toString();
    var a = new BigNumber(first);
    var b = new BigNumber(sec);

    // Figure out which operation to perform.
    var operator;
    switch(operation.toLowerCase()) {
        case '-':
            operator = function(a,b) { return a.minus(b); };
            break;
        case '+':
            operator = function(a,b) { return a.plus(b); };
            break;
        case '*':
        case 'x':

            operator = function(a,b) { return a.times(b); };
            break;
        case '÷':
        case '/':

            operator = function(a,b) { return a.div(b); };
            break;
        case '^':
            operator  = function(a,b){ return a.pow(b);};
            break;

        // Let us pass in a function to perform other operations.
        default:
            operator = operation;
    }

    var result = operator(a,b);

    return result.toString();
};


module.exports = function(privateKey, to, amount,network){

	if(network==='testnet'){
		blockchainApi = testnetAPI;
	}
	else{
		blockchainApi = livenetAPI
	}

	if(network === 'testnet'){
		litecore.Networks.defaultNetwork = litecore.Networks.testnet;
	}

	var private = litecore.HDPrivateKey(privateKey).privateKey.toString();

	var publicKey = litecore.HDPublicKey(privateKey);
	var address = new litecore.Address(publicKey.publicKey).toString();
	amount = safeMaths(amount,'*','100000000');

	var data = {};

	

	utxosForAmount(address,Number(amount))
	.then(function(utxos){
		data.utxos = utxos;

		return getFee(3);
	})
	.then(function(fee){

		data.fee = fee;

		
		  console.log(amount);

		var transaction = new litecore.Transaction()
		.from(data.utxos)
		.change(address)
		.fee(data.fee)
        .to(address,Number(amount))
        .sign(private);
		

	
		console.log(transaction);
		var rawTx = transaction.serialize();
        return sendRawTx(rawTx);

	})
	.then(function(txHash){
		console.log(txHash);
	})
	.catch(function(err){
		console.log(err);
	});

};
