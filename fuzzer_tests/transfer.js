var LicenseContract = artifacts.require("./LicenseContract.sol");
var RootContract = artifacts.require("./RootContract.sol");

contract("Transfer fuzz test", function(accounts) {
  accounts = require("../accounts.js")(accounts);
  before(function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.sign("0x051381", {from: accounts.issuer});
    })
    .then(function() {
      return licenseContract.issueLicense("Desc", "ID", accounts.firstOwner, 100, "Remark", 1509552789, {from:accounts.issuer, value: 7000});
    })
    .then(function() {
      return licenseContract.issueLicense("Desc2", "ID2", accounts.secondOwner, 100, "Remark2", 1509552789, {from:accounts.issuer, value: 7000});
    })
    .then(function() {
      return licenseContract.issueLicense("Desc3", "ID3", accounts.thirdOwner, 100, "Remark3", 1509552789, {from:accounts.issuer, value: 7000});
    })
    .then(function() {
      return licenseContract.issueLicense("Desc4", "ID4", accounts.fourthOwner, 100, "Remark4", 1509552789, {from:accounts.issuer, value: 7000});
    })
    .then(function() {
      return licenseContract.issueLicense("Desc5", "ID5", accounts.firstOwner, 100, "Remark5", 1509552789, {from:accounts.issuer, value: 7000});
    });
  });

  it("works", function() {
    var licenseContract;
    RootContract.deployed().then(function(rootContract) {
      console.log("Root contract address: " + rootContract.address);
    });

    var currentPromise = LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      console.log("License contract address: " + licenseContract.address);
    });

    var relevantAccounts = [accounts.firstOwner, accounts.secondOwner, accounts.thirdOwner, accounts.fourthOwner, accounts.issuer];

    for (var i = 0; i < 1000; i++) {
      (function() {
        var action = Math.floor(Math.random() * 5);
        var issuanceNumber = Math.floor(Math.random() * 5);
        var from = relevantAccounts[Math.floor(Math.random() * relevantAccounts.length)];
        var to = relevantAccounts[Math.floor(Math.random() * relevantAccounts.length)];
        var amount = Math.floor(Math.random() * 50);
        currentPromise = currentPromise.then(function() {
          switch (action) {
            case 0:
              return licenseContract.transfer(issuanceNumber, to, amount, {from: from});
            case 1:
              return licenseContract.transferTemporarily(issuanceNumber, to, amount, {from: from});
            case 2: 
              return licenseContract.reclaim(issuanceNumber, to, amount, {from: from});
          }
        })
        .then(function(transaction) {
          var expectedGasUsage = 0;
          switch (action) {
            case 0: expectedGasUsage = 0; break;
            case 1: expectedGasUsage = 0; break;
            case 2: expectedGasUsage = 0; break;
          }
          console.log(action + " " + transaction.receipt.gasUsed);
        })
        .catch(function(error) {});
      })();
    }
    for (var issuanceNumberInc = 0; issuanceNumberInc < 5; issuanceNumberInc++) {
      for (var accountIndexInc = 0; accountIndexInc < relevantAccounts.length; accountIndexInc++) {
        (function() {
          var issuanceNumber = issuanceNumberInc;
          var accountIndex = accountIndexInc;
          var account = relevantAccounts[accountIndex];
          currentPromise = currentPromise.then(function() {
            return licenseContract.balance(issuanceNumber, account);
          })
          .then(function (balance) {
            process.stdout.write(issuanceNumber + " " + account + ": " + balance)
          })
          .then(function() {
            return licenseContract.temporaryBalance(issuanceNumber, account);
          })
          .then(function (temporaryBalance) {
            process.stdout.write("/" + temporaryBalance);
          })
          .then(function() {
            var promises = relevantAccounts
            .filter(function(address) {
              return address != account;
            })
            .map(function(otherAccount) {
              return licenseContract.temporaryBalanceReclaimableBy(issuanceNumber, otherAccount, account);
            });
            return Promise.all(promises);
          })
          .then(function(reclaimableBalances) {
            reclaimableBalances = reclaimableBalances.map(function(bigNumber) {
              return bigNumber.toNumber();
            });
            var totalReclaimableBalance = reclaimableBalances.reduce(function(a, b) {
              return a + b;
            }, 0);
            process.stdout.write("/" + totalReclaimableBalance + "\n");
          });
        })();
      }
      currentPromise = currentPromise.then(function() {
        console.log("---------------------------------");
      });
    }
    return currentPromise;
  });
});