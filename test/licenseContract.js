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

Promise.prototype.thenBalance = function(issuanceID, account, balance) {
  return this.then(function() {
    return LicenseContract.deployed();
  }).then(function(instance) {
    return instance.balance(issuanceID, account);
  }).then(function(actualBalance) {
    assert.equal(actualBalance.valueOf(), balance)
  })
};

Promise.prototype.thenReclaimableBalance = function(issuanceID, account, balance) {
  return this.then(function() {
    return LicenseContract.deployed();
  }).then(function(instance) {
    return instance.reclaimableBalance(issuanceID, account);
  }).then(function(actualBalance) {
    assert.equal(actualBalance.valueOf(), balance)
  });
};

Promise.prototype.thenReclaimableBalanceBy = function(issuanceID, account, reclaimer, balance) {
  return this.then(function() {
    return LicenseContract.deployed();
  }).then(function(instance) {
    return instance.reclaimableBalanceBy(issuanceID, account, reclaimer);
  }).then(function(actualBalance) {
    assert.equal(actualBalance.valueOf(), balance)
  });
};

Promise.prototype.thenRelevantIssuances = function(owner, expectedRelevantIssuanceIDs) {
  var licenseContract;
  var temp = this;
  
  temp = temp.then(function() {
    return LicenseContract.deployed();
  }).then(function(instance) {
    licenseContract = instance;
  });


  temp = temp.then(function() {
    return licenseContract.relevantIssuancesCount(owner);
  }).then(function(count) {
    assert.equal(count, expectedRelevantIssuanceIDs.length);
  });

  for (var i = 0; i < expectedRelevantIssuanceIDs.length; i++) {
    var j = i;
    temp = temp.then(function() {
      return licenseContract.relevantIssuances(owner, j);
    }).then(function(issuanceID) {
      assert.equal(issuanceID, expectedRelevantIssuanceIDs[j], "relevantIssuances[" + j + "]");
    })
  }
  return temp;
};

Promise.prototype.thenAddressesLicensesCanBeReclaimedFrom = function(issuanceID, originalOwner, expectedAddressesLicensesCanBeReclaimedFrom) {
  var licenseContract;
  var temp = this;
  
  temp = temp.then(function() {
    return LicenseContract.deployed();
  }).then(function(instance) {
    licenseContract = instance;
  });


  temp = temp.then(function() {
    return licenseContract.addressesLicensesCanBeReclaimedFromCount(issuanceID, originalOwner);
  }).then(function(count) {
    assert.equal(count, expectedAddressesLicensesCanBeReclaimedFrom.length);
  });

  for (var i = 0; i < expectedAddressesLicensesCanBeReclaimedFrom.length; i++) {
    var j = i;
    temp = temp.then(function() {
      return licenseContract.addressesLicensesCanBeReclaimedFrom(issuanceID, originalOwner, j);
    }).then(function(issuanceID) {
      assert.equal(issuanceID, expectedAddressesLicensesCanBeReclaimedFrom[j], "addressesLicensesCanBeReclaimedFrom[" + j + "]");
    })
  }
  return temp;
};

assert.transactionCost = function(transaction, expectedCost, methodName) {
  assert.isAtMost(transaction.receipt.gasUsed, expectedCost, "Regression in gas usage for " + methodName + " by " + (transaction.receipt.gasUsed - expectedCost) + " gas");
  assert.isAtLeast(transaction.receipt.gasUsed, expectedCost, "🎉 Improvement in gas usage for " + methodName + " by " + (expectedCost - transaction.receipt.gasUsed) + " gas");
};

class Issuance {
  constructor(array) {
    this.description = array[0];
    this.code = array[1];
    this.originalOwner = array[2];
    this.originalSupply = array[3];
    this.auditTime = array[4];
    this.auditRemark = array[5];
    this.revoked = array[6];
    this.balance = array[7];
    this.reclaimableBalanceCache = array[8];
  }
}

var LicenseContract = artifacts.require("./LicenseContract.sol");

contract("LicenseContract constructor", function(accounts) {
  accounts = require("../accounts.js")(accounts);

  it("should set the issuer's address", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.issuer();
    }).then(function(address) {
      assert.equal(address.valueOf(), accounts.issuer);
    });
  });

  it("should set the issuer's name", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.issuerName();
    }).then(function(name) {
      assert.equal(name.valueOf(), "Soft&Cloud");
    });
  });

  it("should set the issuer's certificate", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.issuerCertificate();
    }).then(function(certificate) {
      assert.equal(certificate.valueOf(), '0x0ce8');
    });
  });

  it("should set the liability", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.liability();
    }).then(function(liability) {
      assert.equal(liability.valueOf(), "We are not liable for anything!");
    });
  });

  it("should set the safekeeping period", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.safekeepingPeriod();
    }).then(function(safekeepingPeriod) {
      assert.equal(safekeepingPeriod.valueOf(), 10);
    });
  });

  it("should set the fee", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.fee();
    }).then(function(fee) {
      assert.equal(fee.valueOf(), 500/*wei*/);
    });
  });

  it("should set the LOB root to the sender's address", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.lobRoot();
    }).then(function(rootAddress) {
      assert.equal(rootAddress.valueOf(), accounts.lobRoot);
    });
  });

  it("does not disable the license contract", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.disabled();
    }).then(function(disabled) {
      assert.equal(disabled.valueOf(), false);
    });
  });
});

contract("License contract signature", function(accounts) {
  accounts = require("../accounts.js")(accounts);

  it("cannot be set from anyone but the issuer", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.sign("0x051381", {from: accounts.firstOwner});
    })
    .thenSolidityThrow();
  });

  it("should be saved when contract is signed", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.sign("0x051381", {from: accounts.issuer});
    }).then(function() {
      return licenseContract.signature();
    }).then(function(signature) {
      assert.equal(signature.valueOf(), "0x051381");
    });
  });

  it("cannot be changed once set", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.sign("0x051381", {from: accounts.issuer});
    })
    .thenSolidityThrow();
  });
})

contract("License issuing", function(accounts) {
  accounts = require("../accounts.js")(accounts);

  it("cannot be done if the license contract has not been signed", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.issueLicense("Desc", "ID", "Original owner", 70, "Remark", 1509552789, accounts.firstOwner, {from:accounts.issuer, value: 500});
    })
    .thenSolidityThrow()
    .then(function() {
      return licenseContract.sign("0x051381", {from: accounts.issuer});
    });
  });

  it("cannot be performed by an address that is not the issuer", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.issueLicense("Desc", "ID", "Original owner", 70, "Remark", 1509552789, accounts.firstOwner, {from:accounts.secondOwner, value: 500});
    }).thenSolidityThrow();
  });

  it("cannot be performed if fee is not transmitted", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.issueLicense("Desc", "ID", "Original owner", 70, "Remark", 1509552789, accounts.firstOwner, {from:accounts.issuer, value: 10});
    }).thenSolidityThrow();
  });

  it("works if called by the issuer and exactly the right fee is transmitted", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.issueLicense("Desc", "ID", "Original owner", 70, "Remark", 1509552789, accounts.firstOwner, {from:accounts.issuer, value: 500});
    }).then(function(transaction) {
      assert.transactionCost(transaction, 223854, "license issuing");
    }).then(function() {
      return licenseContract.issuancesCount();
    }).then(function(issuancesCount) {
      assert.equal(issuancesCount.valueOf(), 1);
    }).thenRelevantIssuances(accounts.firstOwner, [0]);
  });

  
  it("sets the description", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.issuances(0); 
    }).then(function(issuance) {
      assert.equal(new Issuance(issuance).description, "Desc");
    });
  });

  it("sets the code", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.issuances(0); 
    }).then(function(issuance) {
      assert.equal(new Issuance(issuance).code, "ID");
    });
  });

  it("sets the original owner", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.issuances(0); 
    }).then(function(issuance) {
      assert.equal(new Issuance(issuance).originalOwner, "Original owner");
    });
  });

  it("sets the original supply", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.issuances(0);
    }).then(function(issuance) {
      assert.equal(new Issuance(issuance).originalSupply, 70);
    });
  });

  it("sets the audit time", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.issuances(0); 
    }).then(function(issuance) {
      assert.equal(new Issuance(issuance).auditTime, 1509552789);
    });
  });

  it("sets the audit remark", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.issuances(0); 
    }).then(function(issuance) {
      assert.equal(new Issuance(issuance).auditRemark, "Remark");
    });
  });

  it("sets revoked to false", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.issuances(0); 
    }).then(function(issuance) {
      assert.equal(new Issuance(issuance).revoked, false);
    });
  });

  it("initially assigns all licenses to the initial owner", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.issueLicense("Desc", "ID", "Original owner", 70, "Remark", 1509552789, accounts.firstOwner, {from:accounts.issuer, value: 500});
    })
    .thenBalance(0, accounts.firstOwner, 70);
  });
});

contract("License transfer", function(accounts) {
  accounts = require("../accounts.js")(accounts);

  before(function() {
    var licenseContract;
    LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.sign("0x051381", {from: accounts.issuer});
    }).then(function() {
      return licenseContract.issueLicense("Desc", "ID", "Original owner", 70, "Remark", 1509552789, accounts.firstOwner, {from:accounts.issuer, value: 500});
    });
  });

  it("does not work if the sender's address doesn't own any licenses", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.transfer(0, accounts.thirdOwner, 5, {from:accounts.secondOwner});
    })
    .thenSolidityThrow();
  });

  it("does not work if the sender's address doesn't own enough licenses", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.transfer(0, accounts.thirdOwner, 75, {from:accounts.secondOwner});
    })
    .thenSolidityThrow();
  });

  it("can transfer less licenses than currently owned by the sender", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.transfer(0, accounts.secondOwner, 20, {from:accounts.firstOwner});
    })
    .then(function(transaction) {
      assert.transactionCost(transaction, 79003, "transfer");
    })
    .thenBalance(0, accounts.firstOwner, 50)
    .thenBalance(0, accounts.secondOwner, 20)
    .thenRelevantIssuances(accounts.secondOwner, [0]);
  });

  it("can transfer licenses from the second owner to a third owner", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.transfer(0, accounts.thirdOwner, 15, {from:accounts.secondOwner});
    })
    .thenBalance(0, accounts.firstOwner, 50)
    .thenBalance(0, accounts.secondOwner, 5)
    .thenBalance(0, accounts.thirdOwner, 15)
    .thenRelevantIssuances(accounts.thirdOwner, [0]);
  });

  it("cannot transfer licenses twice", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.transfer(0, accounts.thirdOwner, 7, {from:accounts.secondOwner});
    })
    .thenSolidityThrow();
  });

  it("cannot transfer more licenses than currently owned", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.transfer(0, accounts.thirdOwner, 7, {from:accounts.secondOwner});
    })
    .thenSolidityThrow();
  });

  it("can transfer licenses to from one user to himself", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.transfer(0, accounts.secondOwner, 5, {from:accounts.secondOwner});
    })
    .thenBalance(0, accounts.firstOwner, 50)
    .thenBalance(0, accounts.secondOwner, 5)
    .thenBalance(0, accounts.thirdOwner, 15)
    .thenRelevantIssuances(accounts.secondOwner, [0, 0]);
  });

  it("can transfer 0 licenses", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.transfer(0, accounts.fourthOwner, 0, {from:accounts.fourthOwner});
    })
    .thenBalance(0, accounts.firstOwner, 50)
    .thenBalance(0, accounts.secondOwner, 5)
    .thenBalance(0, accounts.thirdOwner, 15)
    .thenBalance(0, accounts.fourthOwner, 0);
  });

  it("can transfer licenses back to the previous owner", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.transfer(0, accounts.secondOwner, 15, {from:accounts.thirdOwner});
    })
    .thenBalance(0, accounts.firstOwner, 50)
    .thenBalance(0, accounts.secondOwner, 20)
    .thenBalance(0, accounts.thirdOwner, 0)
    .thenRelevantIssuances(accounts.secondOwner, [0, 0, 0]);
  });
});

contract("Reclaimable license transfer", function(accounts) {
  accounts = require("../accounts.js")(accounts);

  before(function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.sign("0x051381", {from: accounts.issuer});
    }).then(function() {
      return licenseContract.issueLicense("Desc", "ID", "Original owner", 70, "Remark", 1509552789, accounts.firstOwner, {from:accounts.issuer, value: 500});
    });
  });

  it("results in correct balances for both sides", function() {
    var licenseContract;
    return LicenseContract.deployed()
    .then(function(instance) {
      licenseContract = instance;
      return licenseContract.transferAndAllowReclaim(0, accounts.secondOwner, 20, {from: accounts.firstOwner});
    })
    .then(function(transaction) {
      assert.transactionCost(transaction, 140510, "transferAndReclaim");
    })
    .thenBalance(0, accounts.firstOwner, 50)
    .thenBalance(0, accounts.secondOwner, 20)
    .thenReclaimableBalance(0, accounts.firstOwner, 0)
    .thenReclaimableBalance(0, accounts.secondOwner, 20)
    .thenReclaimableBalanceBy(0, accounts.firstOwner, accounts.firstOwner, 50)
    .thenReclaimableBalanceBy(0, accounts.firstOwner, accounts.secondOwner, 0)
    .thenReclaimableBalanceBy(0, accounts.secondOwner, accounts.firstOwner, 20)
    .thenReclaimableBalanceBy(0, accounts.secondOwner, accounts.secondOwner, 0)
    .thenRelevantIssuances(accounts.firstOwner, [0])
    .thenRelevantIssuances(accounts.secondOwner, [0])
    .thenAddressesLicensesCanBeReclaimedFrom(0, accounts.firstOwner, [accounts.secondOwner])
    .thenAddressesLicensesCanBeReclaimedFrom(0, accounts.secondOwner, [])
  });

  it("allows the lender to reclaim the licenses in one piece", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.reclaim(0, accounts.secondOwner, 20, {from: accounts.firstOwner});
    })
    .then(function(transaction) {
      assert.transactionCost(transaction, 22711, "reclaim");
    })
    .thenBalance(0, accounts.firstOwner, 70)
    .thenBalance(0, accounts.secondOwner, 0)
    .thenReclaimableBalance(0, accounts.firstOwner, 0)
    .thenReclaimableBalance(0, accounts.secondOwner, 0)
    .thenReclaimableBalanceBy(0, accounts.secondOwner, accounts.firstOwner, 0)
    .thenRelevantIssuances(accounts.firstOwner, [0])
    .thenRelevantIssuances(accounts.secondOwner, [0])
    .thenAddressesLicensesCanBeReclaimedFrom(0, accounts.firstOwner, [accounts.secondOwner])
    .thenAddressesLicensesCanBeReclaimedFrom(0, accounts.secondOwner, [])
  });

  it("allows the lender to reclaim the licenses piece by piece", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.transferAndAllowReclaim(0, accounts.secondOwner, 20, {from: accounts.firstOwner});
    })
    .then(function() {
      return licenseContract.reclaim(0, accounts.secondOwner, 5, {from: accounts.firstOwner})
    })
    .thenBalance(0, accounts.firstOwner, 55)
    .thenBalance(0, accounts.secondOwner, 15)
    .then(function() {
      licenseContract.reclaim(0, accounts.secondOwner, 5, {from: accounts.firstOwner})
    })
    .thenBalance(0, accounts.firstOwner, 60)
    .thenBalance(0, accounts.secondOwner, 10)
    .thenReclaimableBalance(0, accounts.firstOwner, 0)
    .thenReclaimableBalance(0, accounts.secondOwner, 10)
    .thenReclaimableBalanceBy(0, accounts.secondOwner, accounts.firstOwner, 10)
  });

  it("does not allow the borrower to transfer the licenses on", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.transfer(0, accounts.thirdOwner, 5, {from:accounts.secondOwner});
    })
    .thenSolidityThrow();
  });

  it("does not allow the borrower to lend the licenses on", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.transferAndAllowReclaim(0, accounts.thirdOwner, 5, {from:accounts.secondOwner});
    })
    .thenSolidityThrow();
  });

  it("does not work if the lender does not own enough licenses", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.transferAndAllowReclaim(0, accounts.secondOwner, 100, {from: accounts.firstOwner});
    })
    .thenSolidityThrow();
  });

  it("does not allow anyone but the borrower to reclaim licenses", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.reclaim(0, accounts.secondOwner, 5, {from:accounts.thirdOwner});
    })
    .thenSolidityThrow();
  });

  it("does not work if the license contract has been revoked", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.revoke(0, {from: accounts.issuer});
    })
    .then(function() {
      return licenseContract.transferAndAllowReclaim(0, accounts.secondOwner, 10, {from: accounts.firstOwner});
    })
    .thenSolidityThrow();
  })

  it("does not allow licenses to be reclaimed if the license contract has been revoked", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.reclaim(0, accounts.secondOwner, 5, {from: accounts.firstOwner});
    })
    .thenSolidityThrow();
  });
});

contract("Revoking an issuing", function(accounts) {
  accounts = require("../accounts.js")(accounts);

  before(function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.sign("0x051381", {from: accounts.issuer});
    });
  });

  it("cannot be performed by anyone but the issuer", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.issueLicense("Desc2", "ID", "Second original owner", 70, "Remark", 1509552789, accounts.firstOwner, {from:accounts.issuer, value: 500});
    })
    .then(function() {
      return licenseContract.revoke(0, {from: accounts.firstOwner});
    })
    .thenSolidityThrow();
  })

  it("can be performed by the issuer", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.issueLicense("Desc2", "ID", "Second original owner", 70, "Remark", 1509552789, accounts.firstOwner, {from:accounts.issuer, value: 500});
    })
    .then(function() {
      return licenseContract.revoke(0, {from: accounts.issuer});
    })
    .then(function() {
      return licenseContract.issuances(0);
    })
    .then(function(issuance) {
      assert.equal(new Issuance(issuance).revoked, true);
    })
  });

  it("does not allow license transfer after the revocation", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.transfer(0, accounts.secondOwner, 85, {from:accounts.firstOwner});
    }).thenSolidityThrow();
  });
});

contract("Disabling the license contract", function(accounts) {
  accounts = require("../accounts.js")(accounts);

  before(function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.sign("0x051381", {from: accounts.issuer});
    })
    .then(function() {
      return licenseContract.issueLicense("Desc", "ID", "First original owner", 70, "Remark", 1509552789, accounts.firstOwner, {from:accounts.issuer, value: 500});
    });
  });

  it("cannot be performed by anyone else", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.disable({from: accounts.firstOwner});
    }).thenSolidityThrow();
  });

  it("cannot be done by the LOB root", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      return instance.disable({from: accounts.lobRoot});
    })
    .thenSolidityThrow();
  });

  it("cannot be done by the LOB root owner", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      return instance.disable({from: accounts.lobRootOwner});
    })
    .thenSolidityThrow();
  });

  it("can be done by the issuer", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.disable({from: accounts.issuer});
    })
    .then(function() {
      return licenseContract.disabled();
    })
    .then(function(disabled) {
      assert.equal(disabled.valueOf(), true);
    });
  });

  it("does not allow the issuance of licenses after the contract has been disabled", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      return instance.issueLicense("Desc", "ID", "Original owner", 70, "Remark", 1509552789, accounts.firstOwner, {from:accounts.issuer});
    })
    .thenSolidityThrow();
  });

  it("does not allow issuances to be revoked after the contract has been disabled", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      return instance.revoke(0, {from: accounts.issuer});
    })
    .thenSolidityThrow();
  });
});

contract("Setting the fee", function(accounts) {
  accounts = require("../accounts.js")(accounts);

  it("can be performed by the LOB root", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.setFee(700, {from: accounts.lobRoot});
    })
    .then(function() {
      return licenseContract.fee();
    })
    .then(function(fee) {
      assert.equal(fee.valueOf(), fee);
    });
  });

  it("cannot be done by anyone but the LOB root", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.setFee(700, {from: accounts.issuer});
    })
    .thenSolidityThrow();
  });
});

contract("Withdrawing fees", function(accounts) {
  accounts = require("../accounts.js")(accounts);

  before(function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.sign("0x051381", {from: accounts.issuer});
    });
  });

  it("can be done by the LOB root", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.issueLicense("Desc", "ID", "Original owner", 70, "Remark", 1509552789, accounts.firstOwner, {from:accounts.issuer, value: 7000});
    }).then(function() {
      return licenseContract.withdraw(6000, accounts.lobRoot, {from:accounts.lobRoot})
    }).then(function() {
      return licenseContract.withdraw(1000, accounts.lobRoot, {from:accounts.lobRoot})
    });
  });

  it("connot be done by anyone but the LOB root", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.issueLicense("Desc", "ID", "Original owner", 70, "Remark", 1509552789, accounts.firstOwner, {from:accounts.issuer, value: 7000});
    }).then(function() {
      return licenseContract.withdraw(6000, accounts.lobRoot, {from:accounts.issuer})
    }).thenSolidityThrow();
  });
});
