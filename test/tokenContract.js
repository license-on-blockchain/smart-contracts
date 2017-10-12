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



var TokenContract = artifacts.require("./LOBTokenContract.sol");

contract('TokenContract constructor', function(accounts) {
  accounts = require("../accounts.js")(accounts);

  it("carries the given license name", function() {
    return TokenContract.deployed().then().then(function(instance) {
      return instance.name();
    }, function(name) {
      assert.equal(name.valueOf(), "Microsoft Office 2013");
    });
  });

  it("has set the total supply correctly", function() {
    return TokenContract.deployed().then().then(function(instance) {
      return instance.totalSupply();
    }, function(totalSupply) {
      assert.equal(totalSupply.valueOf(), 70);
    });
  });

  it("has the symbol constantly set to 'LOB'", function() {
    return TokenContract.deployed().then().then(function(instance) {
      return instance.symbol();
    }, function(symbol) {
      assert.equal(symbol.valueOf(), "LOB");
    });
  });

  it("stores the issuer's address", function() {
    return TokenContract.deployed().then(function(instance) {
      return instance.issuer();
    }).then(function(issuer) {
      assert.equal(issuer.valueOf(), accounts.firstIssuer);
    });
  });

  it("stores the issuer name", function() {
    return TokenContract.deployed().then(function(instance) {
      return instance.issuerName();
    }).then(function(issuer) {
      assert.equal(issuer.valueOf(), "Soft&Cloud");
    });
  });

  it("assigns all licenses to the first owner", function() {
    return TokenContract.deployed().then().then(function(instance) {
      return instance.balanceOf(accounts.firstOwner);
    }, function(balance) {
      assert.equal(balance.valueOf(), 70, "First owner should own 70 licenses");
    });
  });
});

contract('TokenContract revoke', function(accounts) {
  accounts = require("../accounts.js")(accounts);

  it("is initially not revoked", function() {
    return TokenContract.deployed().then().then(function(instance) {
      return instance.isRevoked();
    }, function(revoked) {
      assert.equal(revoked, false);
    });
  });

  it("cannot be revoked by someone else than LOB root", function() {
    return TokenContract.deployed().then(function(instance) {
      return instance.revoke({from: accounts.firstIssuer});
    }).then(function() {
      assert(false, "Revoking from a different account should not work");
    }).thenSolidityThrow();
  });

  it("can be revoked by the LOB root", function() {
    var tokenContract;
    return TokenContract.deployed().then(function(instance) {
      tokenContract = instance;
      return instance.revoke({from: accounts.lobRoot});
    }).then(function() {
      return tokenContract.isRevoked();
    }).then(function(revoked) {
      assert.equal(revoked, true);
    });
  });

  it("cannot be revoked twice", function() {
    var tokenContract;
    return TokenContract.deployed().then(function(instance) {
      return instance.revoke({from: accounts.lobRoot});
    }).thenSolidityThrow();
    // .then(function() {
    //   assert(false, "Revoking from a different account should not work");
    // }).catch(function(error) {
    //   assert.isSolidityThrow(error);
    // });
  });
});

contract('TokenContract license transfer', function(accounts) {
  accounts = require("../accounts.js")(accounts);

  // Initial balance
  // First owner: 70

  it("can transfer licenses from one user to another", function() {
    var tokenContract;
    return TokenContract.deployed().then(function(instance) {
      tokenContract = instance;
      return tokenContract.transfer(accounts.secondOwner, 36, {from: accounts.firstOwner});
    }).then(function() {
      return tokenContract.balanceOf(accounts.firstOwner);
    }).then(function(firstOwnerBalance) {
      assert.equal(firstOwnerBalance.valueOf(), 34, "70 - 36 = 34");
      return tokenContract.balanceOf(accounts.secondOwner);
    }).then(function(secondOwnerBalance) {
      assert.equal(secondOwnerBalance.valueOf(), 36);
    });
  });

  // New balance
  // First owner: 34
  // Second owner: 36

  it("can transfer licenses from the second owner to a third owner", function() {
    var tokenContract;
    return TokenContract.deployed().then(function(instance) {
      tokenContract = instance;
      return tokenContract.transfer(accounts.thirdOwner, 19, {from: accounts.secondOwner});
    }).then(function() {
      return tokenContract.balanceOf(accounts.secondOwner);
    }).then(function(secondOwnerBalance) {
      assert.equal(secondOwnerBalance.valueOf(), 17, "36 - 19 = 17");
      return tokenContract.balanceOf(accounts.thirdOwner);
    }).then(function(thirdOwnerBalance) {
      assert.equal(thirdOwnerBalance.valueOf(), 19);
    });
  });

  // New balance
  // First owner: 34
  // Second owner: 17
  // Third owner: 19

  it("cannot transfer more licenses than owned", function() {
    var tokenContract;
    return TokenContract.deployed().then(function(instance) {
      tokenContract = instance;
      return tokenContract.transfer(accounts.thirdOwner, 18, {from: accounts.secondOwner})
    }).thenSolidityThrow();
  });

  it("can transfer licenses from one user to himself", function() {
    var tokenContract;
    return TokenContract.deployed().then(function(instance) {
      tokenContract = instance;
      return tokenContract.transfer(accounts.thirdOwner, 18, {from: accounts.thirdOwner})
    }).then(function() {
      return tokenContract.balanceOf(accounts.thirdOwner);
    }).then(function(balance) {
      assert.equal(balance, 19);
    });
  });

  it("can transfer licenses back to the previous owner", function() {
    var tokenContract;
    return TokenContract.deployed().then(function(instance) {
      tokenContract = instance;
      return tokenContract.transfer(accounts.secondOwner, 19, {from: accounts.thirdOwner})
    }).then(function() {
      return tokenContract.balanceOf(accounts.thirdOwner);
    }).then(function(balance) {
      assert.equal(balance, 0);
    }).then(function() {
      return tokenContract.balanceOf(accounts.secondOwner);
    }).then(function(balance) {
      assert.equal(balance, 36);
    });
  });

  // New balance
  // First owner: 34
  // Second owner: 36
  // Third owner: 0

  it("can destroy licenses", function() {
    var tokenContract;
    return TokenContract.deployed().then(function(instance) {
      tokenContract = instance;
      return tokenContract.destroy(6, {from: accounts.secondOwner})
    }).then(function() {
      return tokenContract.balanceOf(accounts.secondOwner);
    }).then(function(balance) {
      assert.equal(balance, 30);
    }).then(function() {
      return tokenContract.totalSupply();
    }).then(function(totalSupply) {
      assert.equal(totalSupply, 64, "70 - 6 = 64");
    });
  });

  // New balance
  // First owner: 34
  // Second owner: 30
  // Third owner: 0

  it("cannot destroy more licenses than owned", function() {
    var tokenContract;
    return TokenContract.deployed().then(function(instance) {
      tokenContract = instance;
      return tokenContract.destroy(31, {from: accounts.secondOwner})
    }).thenSolidityThrow();
  });
})
