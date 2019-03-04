const LicenseContract = artifacts.require("./LicenseContract.sol");

const lobAssert = {
  async relevantIssuances(owner, expectedRelevantissuanceNumbers) {
    const licenseContract = await LicenseContract.deployed();
    assert.equal(await licenseContract.relevantIssuancesCount(owner), expectedRelevantissuanceNumbers.length);
  
    for (var i = 0; i < expectedRelevantissuanceNumbers.length; i++) {
      assert.equal(await licenseContract.relevantIssuances(owner, i), expectedRelevantissuanceNumbers[i], "relevantIssuances[" + i + "]");
    }
  },
  async balance(issuanceNumber, account, balance) {
    const licenseContract = await LicenseContract.deployed();
    assert.equal(await licenseContract.balance(issuanceNumber, account), balance);
  },
  async temporaryBalance(issuanceNumber, account, balance) {
    const licenseContract = await LicenseContract.deployed();
    assert.equal(await licenseContract.temporaryBalance(issuanceNumber, account), balance);
  },
  async temporaryBalanceReclaimableBy(issuanceNumber, account, reclaimer, balance) {
    const licenseContract = await LicenseContract.deployed();
    assert.equal(await licenseContract.temporaryBalanceReclaimableBy(issuanceNumber, account, reclaimer), balance);
  },
  async temporaryLicenseHolders(issuanceNumber, originalOwner, expectedTemporaryLicenseHolders) {
    const licenseContract = await LicenseContract.deployed();

    const count = await licenseContract.temporaryLicenseHoldersCount(issuanceNumber, originalOwner);
    assert.equal(count, expectedTemporaryLicenseHolders.length);
  
    for (var i = 0; i < expectedTemporaryLicenseHolders.length; i++) {
      const temporaryLicenseHolder = await licenseContract.temporaryLicenseHolders(issuanceNumber, originalOwner, i);
      assert.equal(temporaryLicenseHolder, expectedTemporaryLicenseHolders[i], "temporaryLicenseHolders[" + i + "]");
    }
  },
  transactionCost(transaction, expectedCost, methodName) {
    assert.isAtMost(transaction.receipt.gasUsed, expectedCost + 64, "Regression in gas usage for " + methodName + " by " + (transaction.receipt.gasUsed - expectedCost) + " gas");
    assert.isAtLeast(transaction.receipt.gasUsed, expectedCost - 64, "🎉 Improvement in gas usage for " + methodName + " by " + (expectedCost - transaction.receipt.gasUsed) + " gas");
  }
};

module.exports = lobAssert;
