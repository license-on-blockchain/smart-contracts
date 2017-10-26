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

Promise.prototype.thenBalance = function(licenseIndex, account, balance) {
  return this.then(function() {
    return LicenseContract.deployed();
  }).then(function(instance) {
    return instance.balance(licenseIndex, account);
  }).then(function(actualBalance) {
    assert.equal(actualBalance.valueOf(), balance)
  })
};



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

contract("License issuing", function(accounts) {
  accounts = require("../accounts.js")(accounts);

  it("cannot be performed by an address that is not the issuer", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.issueLicense("Desc", "ID", 70, "Remark", "Liability", accounts.firstOwner, {from:accounts.secondOwner, value: 500});
    }).thenSolidityThrow();
  });

  it("cannot be performed if fee is not transmitted", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.issueLicense("Desc", "ID", 70, "Remark", "Liability", accounts.firstOwner, {from:accounts.issuer, value: 10});
    }).thenSolidityThrow();
  });

  it("works if called by the issuer and exactly the right fee is transmitted", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.issueLicense("Desc", "ID", 70, "Remark", "Liability", accounts.firstOwner, {from:accounts.issuer, value: 500});
    }).then(function() {
      // CertificateText would throw if the issuance with ID 0 does not exist
      return licenseContract.certificateText(0);
    });
  });

  it("initially assigns all licenses to the initial owner", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.issueLicense("Desc", "ID", 70, "Remark", "Liability", accounts.firstOwner, {from:accounts.issuer, value: 500});
    })
    .thenBalance(0, accounts.firstOwner, 70);
  });
});

contract("License transfer", function(accounts) {
  accounts = require("../accounts.js")(accounts);

  before(function() {
    LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.issueLicense("Desc", "ID", 70, "Remark", "Liability", accounts.firstOwner, {from:accounts.issuer, value: 500});
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

  it("can transfer licenses less licenses than currently owned by the sender", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.transfer(0, accounts.secondOwner, 20, {from:accounts.firstOwner});
    })
    .thenBalance(0, accounts.firstOwner, 50)
    .thenBalance(0, accounts.secondOwner, 20);
  });

  it("can transfer licenses from the second owner to a third owner", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.transfer(0, accounts.thirdOwner, 15, {from:accounts.secondOwner});
    })
    .thenBalance(0, accounts.firstOwner, 50)
    .thenBalance(0, accounts.secondOwner, 5)
    .thenBalance(0, accounts.thirdOwner, 15);
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
    .thenBalance(0, accounts.thirdOwner, 15);
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
    .thenBalance(0, accounts.thirdOwner, 0);
  });

  it("can destroy licenses", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.destroy(0, 3, {from:accounts.secondOwner});
    })
    .thenBalance(0, accounts.firstOwner, 50)
    .thenBalance(0, accounts.secondOwner, 17)
    .thenBalance(0, accounts.thirdOwner, 0);
  });

  it("cannot destroy more licenses than currently owned", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.destroy(0, 20, {from:accounts.secondOwner});
    })
    .thenSolidityThrow();
  });
});

contract("Reclaimable license transfer", function(accounts) {
  accounts = require("../accounts.js")(accounts);

  before(function() {
    LicenseContract.deployed().then(function(instance) {
      return instance.issueLicense("Desc", "ID", 70, "Remark", "Liability", accounts.firstOwner, {from:accounts.issuer, value: 500});
    });
  });

  it("results in correct balances for both sides", function() {
    return LicenseContract.deployed()
    .then(function(instance) {
      return instance.transferAndAllowReclaim(0, accounts.secondOwner, 20, {from: accounts.firstOwner});
    })
    .thenBalance(0, accounts.firstOwner, 50)
    .thenBalance(0, accounts.secondOwner, 20);
  });

  it("allows the lender to reclaim the licenses in one piece", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.reclaim(0, accounts.secondOwner, 20, {from: accounts.firstOwner});
    })
    .thenBalance(0, accounts.firstOwner, 70)
    .thenBalance(0, accounts.secondOwner, 0);
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
    .thenBalance(0, accounts.secondOwner, 10);
  });

  it("does not allow the borrower to transfer the licenses on", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.transfer(0, accounts.thirdOwner, 5, {from:accounts.secondOwner});
    })
    .thenSolidityThrow();
  });

  it("does not allow the borrower to destroy the licenses", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.destroy(0, 5, {from:accounts.secondOwner});
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
      return licenseContract.transferAndAllowReclaim(0, accounts.secondOwner, 100, {from: accounts.firstOwner});
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

  it("cannot be performed by anyone but the issuer", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.issueLicense("Desc2", "ID", 70, "Remark", "Liability", accounts.firstOwner, {from:accounts.issuer, value: 500});
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
      return licenseContract.issueLicense("Desc2", "ID", 70, "Remark", "Liability", accounts.firstOwner, {from:accounts.issuer, value: 500});
    })
    .then(function() {
      return licenseContract.revoke(0, {from: accounts.issuer});
    })
    .then(function() {
      return licenseContract.isRevoked(0);
    })
    .then(function(revoked) {
      assert.equal(revoked, true);
    })
  });

  it("does not allow license transfer after the revocation", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.transfer(0, accounts.secondOwner, 85, {from:accounts.firstOwner});
    }).thenSolidityThrow();
  });

  it("does not allow licenses to be destroyed after the revocation", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.destroy(0, 5, {from: accounts.firstOwner})
    })
    .thenSolidityThrow();
  });
});

contract("Disabling the license contract", function(accounts) {
  accounts = require("../accounts.js")(accounts);

  it("cannot be performed by anyone else", function() {
    return LicenseContract.deployed().then(function(instance) {
      return instance.disable({from: accounts.firstOwner});
    }).thenSolidityThrow();
  });

  it("can be done by the LOB root", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.disable({from: accounts.lobRoot});
    })
    .then(function() {
      return licenseContract.disabled();
    })
    .then(function(disabled) {
      assert.equal(disabled.valueOf(), true);
    });
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
      return instance.issueLicense("Desc", "ID", 70, "Remark", "Liability", accounts.firstOwner, {from:accounts.issuer});
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

  it("can be done by the LOB root", function() {
    var licenseContract;
    return LicenseContract.deployed().then(function(instance) {
      licenseContract = instance;
      return licenseContract.issueLicense("Desc", "ID", 70, "Remark", "Liability", accounts.firstOwner, {from:accounts.issuer, value: 7000});
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
      return licenseContract.issueLicense("Desc", "ID", 70, "Remark", "Liability", accounts.firstOwner, {from:accounts.issuer, value: 7000});
    }).then(function() {
      return licenseContract.withdraw(6000, accounts.lobRoot, {from:accounts.issuer})
    }).thenSolidityThrow();
  });
});
