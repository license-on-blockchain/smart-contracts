// Test framework extension to detect solidity throws easily

Promise.prototype.thenSolidityThrow = function(description) {
  if (typeof description === 'undefined') {
    description = "Expected to throw";
  }
  return this.then(function() {
    assert(false, description);
  }).catch(function(error) {
    assert(error.toString().indexOf("invalid opcode") != -1, "Solidity should throw (calling an invalid opcode), got error: " + error.toString());
  });
};

assert.transactionCost = function(transaction, expectedCost, methodName) {
  assert.isAtMost(transaction.receipt.gasUsed, expectedCost, "Regression in gas usage for " + methodName + " by " + (transaction.receipt.gasUsed - expectedCost) + " gas");
  assert.isAtLeast(transaction.receipt.gasUsed, expectedCost, "🎉 Improvement in gas usage for " + methodName + " by " + (expectedCost - transaction.receipt.gasUsed) + " gas");
};

var LicenseContract = artifacts.require("./LicenseContract.sol");
var RootContract = artifacts.require("./RootContract.sol");

contract("Root contract constructor", function(accounts) {
  accounts = require("../accounts.js")(accounts);

  it("sets the owner to the message sender", function() {
    return RootContract.deployed().then(function(rootContract) {
      return rootContract.owner();
    })
    .then(function(owner) {
      assert.equal(owner.valueOf(), accounts.lobRootOwner);
    });
  })
});

contract("Root contract default fee", function(accounts) {
  accounts = require("../accounts.js")(accounts);

  it("is initially set to 0", function() {
    return RootContract.deployed().then(function(rootContract) {
      return rootContract.defaultFee();
    })
    .then(function(defaultFee) {
      assert.equal(defaultFee.valueOf(), 0);
    });
  });

  it("cannot be changed from any address but the owner", function() {
    return RootContract.deployed().then(function(rootContract) {
      return rootContract.setDefaultFee(500, {from:accounts.firstOwner});
    })
    .thenSolidityThrow();
  });

  it("can be changed by the owner", function() {
    var rootContract;
    return RootContract.deployed().then(function(instance) {
      rootContract = instance;
      return rootContract.setDefaultFee(800, {from: accounts.lobRootOwner});
    })
    .then(function() {
      return rootContract.defaultFee();
    })
    .then(function(defaultFee) {
      assert.equal(defaultFee.valueOf(), 800);
    });
  });
});

contract("Root contract owner", function(accounts) {
  accounts = require("../accounts.js")(accounts);

  it("cannot be changed by anyone but the current owner", function() {
    return RootContract.deployed().then(function(rootContract) {
      return rootContract.setOwner(accounts.firstOwner, {from: accounts.secondOwner});
    })
    .thenSolidityThrow();
  });

  it("can be changed by the current owner", function() {
    var rootContract;
    return RootContract.deployed().then(function(instance) {
      rootContract = instance;
      return rootContract.setOwner(accounts.firstOwner, {from: accounts.lobRootOwner});
    })
    .then(function() {
      return rootContract.owner();
    })
    .then(function(owner) {
      assert.equal(owner.valueOf(), accounts.firstOwner);
    });
  });
});

contract("License contract's root", function(accounts) {
  accounts = require("../accounts.js")(accounts);

  var rootContract;
  var licenseContract;

  before(function() {
    return RootContract.deployed().then(function(instance) {
      rootContract = instance;
      return rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer});
    })
    .then(function(transaction) {
      var creationLogs = transaction.logs.filter(function(log) {return log.event == "LicenseContractCreation"});
      assert.equal(creationLogs.length, 1);
      var creationLog = creationLogs[0];
      var licenseContractAddress = creationLog.args.licenseContractAddress;
      licenseContract = LicenseContract.at(licenseContractAddress);
    })
  });
});

contract("License contract disabling", function(accounts) {
  accounts = require("../accounts.js")(accounts);

  var rootContract;
  var licenseContract;

  before(function() {
    return RootContract.deployed().then(function(instance) {
      rootContract = instance;
      return rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer});
    })
    .then(function(transaction) {
      var creationLogs = transaction.logs.filter(function(log) {return log.event == "LicenseContractCreation"});
      assert.equal(creationLogs.length, 1);
      var creationLog = creationLogs[0];
      var licenseContractAddress = creationLog.args.licenseContractAddress;
      licenseContract = LicenseContract.at(licenseContractAddress);
    })
  });

  it("cannot be done by anyone but the root contract owner", function() {
    return rootContract.disableLicenseContract(licenseContract.address, {from: accounts.firstOwner})
    .thenSolidityThrow();
  });

  it("can be performed by the root contract owner", function() {
    return rootContract.disableLicenseContract(licenseContract.address, {from: accounts.lobRootOwner})
    .then(function() {
      return licenseContract.disabled();
    })
    .then(function(disabled) {
      assert.equal(disabled, true);
    })
  });
});

contract("Withdrawal from license contracts", function(accounts) {
  accounts = require("../accounts.js")(accounts);

  before(function() {
    return RootContract.deployed().then(function(instance) {
      rootContract = instance;
      return rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer});
    })
    .then(function(transaction) {
      var creationLogs = transaction.logs.filter(function(log) {return log.event == "LicenseContractCreation"});
      assert.equal(creationLogs.length, 1);
      var creationLog = creationLogs[0];
      var licenseContractAddress = creationLog.args.licenseContractAddress;
      licenseContract = LicenseContract.at(licenseContractAddress);
    })
    .then(function() {
      return licenseContract.sign("0x50", {from: accounts.issuer});
    })
    .then(function() {
      return licenseContract.issueLicense("Desc", "ID", "Original owner", 70, "Remark", 1509552789, accounts.firstOwner, {from:accounts.issuer, value: 500});
    })
  });

  it("cannot be done by anyone but the root contract owner", function() {
    return rootContract.withdrawFromLicenseContract(licenseContract.address, 500, accounts.thirdOwner, {from: accounts.thirdOwner})
    .thenSolidityThrow();
  });

  it("cannot be done with root contract as recipient", function() {
    return rootContract.withdrawFromLicenseContract(licenseContract.address, 500, rootContract.address, {from: accounts.lobRootOwner})
    .thenSolidityThrow();
  });

  it("can be done by the root contract owner", function() {
    var originalBalance = web3.eth.getBalance(accounts.thirdOwner);
    return rootContract.withdrawFromLicenseContract(licenseContract.address, 500, accounts.thirdOwner, {from: accounts.lobRootOwner})
    .then(function() {
      assert.equal(web3.eth.getBalance(accounts.thirdOwner).minus(originalBalance).toNumber(), 500);
    })
  });
});

contract("Setting a license contract's fee", function(accounts) {
  accounts = require("../accounts.js")(accounts);

  var rootContract;
  var licenseContract;

  before(function() {
    return RootContract.deployed().then(function(instance) {
      rootContract = instance;
      return rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer});
    })
    .then(function(transaction) {
      var creationLogs = transaction.logs.filter(function(log) {return log.event == "LicenseContractCreation"});
      assert.equal(creationLogs.length, 1);
      var creationLog = creationLogs[0];
      var licenseContractAddress = creationLog.args.licenseContractAddress;
      licenseContract = LicenseContract.at(licenseContractAddress);
    })
  });

  it("cannot be done by anyone but the root contract owner", function() {
    return rootContract.setLicenseContractFee(licenseContract.address, 50, {from: accounts.firstOwner})
    .thenSolidityThrow();
  });

  it("can be done by the root contract owner", function() {
    return rootContract.setLicenseContractFee(licenseContract.address, 50, {from: accounts.lobRootOwner})
    .then(function() {
      return licenseContract.fee();
    })
    .then(function(fee) {
      assert.equal(fee.valueOf(), 50);
    })
  });
});

contract("Root contract disabling", function(accounts) {
  accounts = require("../accounts.js")(accounts);

  var rootContract;

  before(function() {
    return RootContract.deployed().then(function(instance) {
      rootContract = instance;
    });
  })

  it("cannot be done by anyone but the root contract owner", function() {
    return rootContract.disable({from: accounts.issuer})
    .thenSolidityThrow();
  });

  it("can be done by anyone but the root contract owner", function() {
    return rootContract.disable({from: accounts.lobRootOwner})
    .then(function(transaction) {
      var disabledLogs = transaction.logs.filter(function(obj) { return obj.event == "Disabled"; });
      assert.equal(disabledLogs.length, 1);
    })
  });
});

contract("Creating a new license contract", function(accounts) {
  accounts = require("../accounts.js")(accounts);

  var licenseContract;
  var rootContract;

  before(function() {
    return RootContract.deployed().then(function(instance) {
      rootContract = instance;
      return rootContract.setDefaultFee(950, {from: accounts.lobRootOwner});
    }).then(function() {
      return rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer});
    })
    .then(function(transaction) {
      var creationLogs = transaction.logs.filter(function(log) {return log.event == "LicenseContractCreation"});
      assert.equal(creationLogs.length, 1);
      var creationLog = creationLogs[0];
      var licenseContractAddress = creationLog.args.licenseContractAddress;
      licenseContract = LicenseContract.at(licenseContractAddress);
    })
  });


  it("does not consume too much gas", function() {
    return RootContract.deployed().then(function(instance) {
      rootContract = instance;
      return rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer});
    })
    .then(function(transaction) {
      assert.transactionCost(transaction, 3274000, "createLicenseContract");
    });
  });

  it("saves the license contract address in the root contract", function() {
    return rootContract.licenseContractCount()
    .then(function(licenseContractCount) {
      assert.equal(licenseContractCount.valueOf(), 2);
    })
    .then(function() {
      return rootContract.licenseContracts(0);
    })
    .then(function(licenseContractAddress) {
      assert.equal(licenseContractAddress.valueOf(), licenseContract.address);
    });
  })

  it("has the LOB root set to the root contract", function() {
    return licenseContract.lobRoot()
    .then(function(lobRoot) {
      assert.equal(lobRoot.valueOf(), rootContract.address);
    });
  });

  it("has the default fee set as fee", function() {
    return licenseContract.fee()
    .then(function(fee) {
      assert.equal(fee.valueOf(), 950);
    });
  });

  it("carries the issuer's name", function() {
    return licenseContract.issuerName()
    .then(function(issuerName) {
      assert.equal(issuerName.valueOf(), "Soft&Cloud");
    });
  });

  it("carries the issuer's certificate", function() {
    return licenseContract.issuerCertificate()
    .then(function(issuerCertificate) {
      assert.equal(issuerCertificate.valueOf(), "0x5e789a");
    });
  });

  it("sets the license contract issuer to the caller of the root contract function", function() {
    return licenseContract.issuer()
    .then(function(issuer) {
      assert.equal(issuer.valueOf(), accounts.issuer);
    });
  });

  it("cannot be done if root contract is disabled", function() {
    return rootContract.disable({from: accounts.lobRootOwner})
    .then(function() {
      return rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer});
    })
    .thenSolidityThrow();
  });
});