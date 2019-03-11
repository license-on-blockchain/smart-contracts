const LicenseContract = artifacts.require("./LicenseContract.sol");

const lobAssert = {
  async relevantIssuances(licenseContract, owner, expectedRelevantissuanceNumbers) {
    assert.equal(await licenseContract.relevantIssuancesCount(owner), expectedRelevantissuanceNumbers.length);
  
    for (var i = 0; i < expectedRelevantissuanceNumbers.length; i++) {
      assert.equal(await licenseContract.relevantIssuances(owner, i), expectedRelevantissuanceNumbers[i], "relevantIssuances[" + i + "]");
    }
  },
  async balance(licenseContract, issuanceNumber, account, balance) {
    assert.equal(await licenseContract.balance(issuanceNumber, account), balance);
  },
  async temporaryBalance(licenseContract, issuanceNumber, account, balance) {
    assert.equal(await licenseContract.temporaryBalance(issuanceNumber, account), balance);
  },
  async temporaryBalanceReclaimableBy(licenseContract, issuanceNumber, account, reclaimer, balance) {
    assert.equal(await licenseContract.temporaryBalanceReclaimableBy(issuanceNumber, account, reclaimer), balance);
  },
  async temporaryLicenseHolders(licenseContract, issuanceNumber, originalOwner, expectedTemporaryLicenseHolders) {
    const count = await licenseContract.temporaryLicenseHoldersCount(issuanceNumber, originalOwner);
    assert.equal(count, expectedTemporaryLicenseHolders.length);
  
    for (var i = 0; i < expectedTemporaryLicenseHolders.length; i++) {
      const temporaryLicenseHolder = await licenseContract.temporaryLicenseHolders(issuanceNumber, originalOwner, i);
      assert.equal(temporaryLicenseHolder, expectedTemporaryLicenseHolders[i], "temporaryLicenseHolders[" + i + "]");
    }
  },
  async transferFeeTiers(licenseContract, tiers) {
    const count = await licenseContract.getTransferFeeTiersCount();
    assert.equal(count, tiers.length);

    for (let i = 0; i < tiers.length; i++) {
      const tier = await licenseContract.getTransferFeeTier(i);
      assert.equal(tiers[i][0], tier[0], "transferFeeTier[" + i + "].minimumLicenseValue");
      assert.equal(tiers[i][1], tier[1], "transferFeeTier[" + i + "].fee");
    }
  },
  transactionCost(transaction, expectedCost, methodName) {
    assert.isAtMost(transaction.receipt.gasUsed, expectedCost + 64, "Regression in gas usage for " + methodName + " by " + (transaction.receipt.gasUsed - expectedCost) + " gas");
    assert.isAtLeast(transaction.receipt.gasUsed, expectedCost - 64, "🎉 Improvement in gas usage for " + methodName + " by " + (expectedCost - transaction.receipt.gasUsed) + " gas");
  }
};

module.exports = lobAssert;
