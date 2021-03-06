const truffleAssert = require('truffle-assertions');
const BigNumber = require('bignumber.js');
const lobAssert = require('./lib/lobAssert.js');
const Accounts = require('./lib/Accounts.js');
const LicenseContract = artifacts.require("./LicenseContract.sol");
const EtherPriceOracleStub = artifacts.require("./EtherPriceOracleStub.sol");

class Issuance {
  constructor(array) {
    this.description = array[0];
    this.code = array[1];
    this.originalSupply = array[2];
    this.originalValue = array[3];
    this.auditTime = array[4];
    this.auditRemark = array[5];
    this.revoked = array[6];
    this.revocationReason = array[7];
    this.balance = array[8];
    this.temporaryBalance = array[9];
    this.temporaryLicenseHolders = array[10];
  }
}

contract("LicenseContract constructor", function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  it("should set the issuer's address", async () => {
    const licenseContract = await LicenseContract.deployed();
    assert.equal(await licenseContract.issuer(), accounts.issuer);
  });

  it("should set the issuer's name", async () => {
    const licenseContract = await LicenseContract.deployed();
    assert.equal(await licenseContract.issuerName(), "Soft&Cloud");
  });

  it("should set the issuer's certificate", async () => {
    const licenseContract = await LicenseContract.deployed();
    assert.equal(await licenseContract.issuerSSLCertificate(), '0x0ce8');
  });

  it("should set the liability", async () => {
    const licenseContract = await LicenseContract.deployed();
    assert.equal(await licenseContract.liability(), "We are not liable for anything!");
  });

  it("should set the safekeeping period", async () => {
    const licenseContract = await LicenseContract.deployed();
    assert.equal(await licenseContract.safekeepingPeriod(), 10);
  });

  it("should set the LOB root to the sender's address", async () => {
    const licenseContract = await LicenseContract.deployed();
    assert.equal(await licenseContract.lobRoot(), accounts.lobRoot);
  });

  it("does not disable the license contract", async () => {
    const licenseContract = await LicenseContract.deployed();
    assert.equal(await licenseContract.disabled(), false);
  });

  it("should set the manager address to 0x0", async () => {
    const licenseContract = await LicenseContract.deployed();
    assert.equal(await licenseContract.managerAddress(), accounts.zero);
  });

  it("should set the price oracle address", async () => {
    const etherPriceOracle = (await EtherPriceOracleStub.deployed()).address;
    const licenseContract = await LicenseContract.deployed();
    assert.equal(await licenseContract.etherPriceOracle(), etherPriceOracle);
  })

  it("issuance fee factor is set manually", async () => {
    const licenseContract = await LicenseContract.deployed();
    assert.equal(await licenseContract.issuanceFeeFactor(), 5000);
  });
});

contract("License contract signature", function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  it("cannot be set from anyone but the issuer", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.sign("0x051381", {from: accounts.firstOwner}));
  });

  it("should be saved when contract is signed", async () => {
    const licenseContract = await LicenseContract.deployed();
    const tx = await licenseContract.sign("0x051381", {from: accounts.issuer});
    assert.equal(await licenseContract.signature(), "0x051381");
    truffleAssert.eventEmitted(tx, 'Signing');
  });

  it("cannot be changed once set", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.sign("0x051381", {from: accounts.issuer}));
  });
});

contract("License issuing", function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  it("cannot be done if the license contract has not been signed", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.issueLicense("Desc", "ID", /*originalValue=*/1000, accounts.firstOwner, 70, "Remark", 1509552789, {from:accounts.issuer, value: 500}));
    await licenseContract.sign("0x051381", {from: accounts.issuer});
  });

  it("cannot be performed by an address that is not the issuer", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.issueLicense("Desc", "ID", /*originalValue=*/1000, accounts.firstOwner, 70, "Remark", 1509552789, {from:accounts.secondOwner, value: 500}));
  });

  it("cannot be performed by the LOB root", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.issueLicense("Desc", "ID", /*originalValue=*/1000, accounts.firstOwner, 70, "Remark", 1509552789, {from:accounts.lobRoot, value: 500}));
  });

  it("cannot be performed by the LOB root owner", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.issueLicense("Desc", "ID", /*originalValue=*/1000, accounts.firstOwner, 70, "Remark", 1509552789, {from:accounts.lobRootOwner, value: 500}));
  });

  it("cannot be performed if the issuance fee is not transmitted", async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.setTransferFeeTiers([0, 100000], [100, 50], {from: accounts.lobRoot}); // 0€: 1%, 1000€: 0.5%
    await licenseContract.setIssuanceFeeFactor(5000, {from: accounts.lobRoot}); // 50%

    assert.equal(await licenseContract.getTransferFee(100 * 1000), 500 * 1000);

    // Issuance fee for first tier: 70 * 10€ * 1% * 50% = 3.50€ = 350ct = 350000 Wei
    // Issuance fee for second tier: 1000€ * 50% * 50% = 5€ = 500ct = 250000 Wei
    // Choose fee from second tier
    await truffleAssert.fails(licenseContract.issueLicense("Desc", "ID", /*originalValue=*/1000, accounts.firstOwner, 70, "Remark", 1509552789, {from:accounts.issuer, value: 240000}));
  });

  it("works if called by the issuer and exactly the right issuance fee is transmitted", async () => {
    const licenseContract = await LicenseContract.deployed();
    // Fee calculation see above
    const transaction = await licenseContract.issueLicense("Desc", "ID", /*originalValue=*/1000, accounts.firstOwner, 70, "Remark", 1509552789, {from:accounts.issuer, value: 350000});
    lobAssert.transactionCost(transaction, 221215, "license issuing");
    await lobAssert.relevantIssuances(licenseContract, accounts.firstOwner, [0]);
  });

  it("emits the Issuing event", async () => {
    const licenseContract = await LicenseContract.deployed();
    // Fee calculation see above
    const transaction = await licenseContract.issueLicense("Desc", "ID", /*originalValue=*/1000, accounts.firstOwner, 70, "Remark", 1509552789, {from:accounts.issuer, value: 350000});
    truffleAssert.eventEmitted(transaction, 'Issuing', (event) => {
      return event.issuanceNumber == 1;
    });
  });

  it("transfers the fees to the right parties", async () => {
    const licenseContract = await LicenseContract.deployed();
    const priceOracle = await EtherPriceOracleStub.deployed();
    const oldLobRootBalance = new BigNumber(await web3.eth.getBalance(accounts.lobRoot));

    await licenseContract.issueLicense("Desc", "ID", /*originalValue=*/1000, accounts.firstOwner, 70, "Remark", 1509552789, {from:accounts.issuer, value: 350000});

    const newLobRootBalance = new BigNumber(await web3.eth.getBalance(accounts.lobRoot));

    assert.equal(newLobRootBalance.minus(oldLobRootBalance).toString(), 350000);
  });

  it('uses the transfer price tiers to calculate the issuance fee', async () => {
    const licenseContract = await LicenseContract.deployed();
    // Issuance fee: 100 * 10€ * 0.5% * 50% = 3.50€ = 350ct = 350000 Wei
    await licenseContract.issueLicense("Desc", "ID", /*originalValue=*/1000, accounts.secondOwner, 100, "Remark", 1509552789, {from:accounts.issuer, value: 250000});
  });

  it("sets the description", async () => {
    const licenseContract = await LicenseContract.deployed();
    const issuance = await licenseContract.issuances(0);
    assert.equal(new Issuance(issuance).description, "Desc");
  });

  it("sets the code", async () => {
    const licenseContract = await LicenseContract.deployed();
    const issuance = await licenseContract.issuances(0);
      assert.equal(new Issuance(issuance).code, "ID");
  });

  it("sets the original supply", async () => {
    const licenseContract = await LicenseContract.deployed();
    const issuance = await licenseContract.issuances(0);
    assert.equal(new Issuance(issuance).originalSupply, 70);
  });

  it("sets the audit time", async () => {
    const licenseContract = await LicenseContract.deployed();
    const issuance = await licenseContract.issuances(0);
    assert.equal(new Issuance(issuance).auditTime, 1509552789);
  });

  it("sets the audit remark", async () => {
    const licenseContract = await LicenseContract.deployed();
    const issuance = await licenseContract.issuances(0);
    assert.equal(new Issuance(issuance).auditRemark, "Remark");
  });

  it("sets revoked to false", async () => {
    const licenseContract = await LicenseContract.deployed();
    const issuance = await licenseContract.issuances(0);
    assert.equal(new Issuance(issuance).revoked, false);
  });

  it("initially assigns all licenses to the initial owner", async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.setIssuanceFeeFactor(0, {from: accounts.lobRoot});
    await licenseContract.issueLicense("Desc", "ID", /*originalValue=*/1000, accounts.firstOwner, 70, "Remark", 1509552789, {from:accounts.issuer, value: 500});
    await lobAssert.balance(licenseContract, 0, accounts.firstOwner, 70);
  });
});

contract("License transfer", function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  before(async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.sign("0x051381", {from: accounts.issuer});
    await licenseContract.issueLicense("Desc", "ID", /*originalValue=*/1000, accounts.firstOwner, 70, "Remark", 1509552789, {from:accounts.issuer, value: 500});
  });

  it("does not work if the sender's address doesn't own any licenses", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.transfer(0, accounts.thirdOwner, 5, {from:accounts.secondOwner}));
  });

  it("does not work if the sender's address doesn't own enough licenses", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.transfer(0, accounts.thirdOwner, 75, {from:accounts.secondOwner}));
  });

  it("can transfer less licenses than currently owned by the sender", async () => {
    const licenseContract = await LicenseContract.deployed();
    const transaction = await licenseContract.transfer(0, accounts.secondOwner, 20, {from:accounts.firstOwner});
    lobAssert.transactionCost(transaction, 82477, "transfer");
    await lobAssert.balance(licenseContract, 0, accounts.firstOwner, 50);
    await lobAssert.balance(licenseContract, 0, accounts.secondOwner, 20);
    await lobAssert.relevantIssuances(licenseContract, accounts.secondOwner, [0]);
  });

  it("can transfer licenses from the second owner to a third owner", async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.transfer(0, accounts.thirdOwner, 15, {from:accounts.secondOwner});
    await lobAssert.balance(licenseContract, 0, accounts.firstOwner, 50);
    await lobAssert.balance(licenseContract, 0, accounts.secondOwner, 5);
    await lobAssert.balance(licenseContract, 0, accounts.thirdOwner, 15);
    await lobAssert.relevantIssuances(licenseContract, accounts.thirdOwner, [0]);
  });

  it("cannot transfer licenses twice", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.transfer(0, accounts.thirdOwner, 7, {from:accounts.secondOwner}));
  });

  it("cannot transfer more licenses than currently owned", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.transfer(0, accounts.thirdOwner, 7, {from:accounts.secondOwner}));
  });

  it("can transfer licenses to from one user to himself", async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.transfer(0, accounts.secondOwner, 5, {from:accounts.secondOwner});
    await lobAssert.balance(licenseContract, 0, accounts.firstOwner, 50);
    await lobAssert.balance(licenseContract, 0, accounts.secondOwner, 5);
    await lobAssert.balance(licenseContract, 0, accounts.thirdOwner, 15);
    await lobAssert.relevantIssuances(licenseContract, accounts.secondOwner, [0, 0]);
  });

  it("can transfer 0 licenses", async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.transfer(0, accounts.fourthOwner, 0, {from:accounts.fourthOwner});
    await lobAssert.balance(licenseContract, 0, accounts.firstOwner, 50);
    await lobAssert.balance(licenseContract, 0, accounts.secondOwner, 5);
    await lobAssert.balance(licenseContract, 0, accounts.thirdOwner, 15);
    await lobAssert.balance(licenseContract, 0, accounts.fourthOwner, 0);
  });

  it("can transfer licenses back to the previous owner", async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.transfer(0, accounts.secondOwner, 15, {from:accounts.thirdOwner});
    await lobAssert.balance(licenseContract, 0, accounts.firstOwner, 50);
    await lobAssert.balance(licenseContract, 0, accounts.secondOwner, 20);
    await lobAssert.balance(licenseContract, 0, accounts.thirdOwner, 0);
    await lobAssert.relevantIssuances(licenseContract, accounts.secondOwner, [0, 0, 0]);
  });

  it("emits the Transfer event", async () => {
    const licenseContract = await LicenseContract.deployed();
    const transaction = await licenseContract.transfer(0, accounts.firstOwner, 5, {from:accounts.secondOwner});
    await lobAssert.balance(licenseContract, 0, accounts.firstOwner, 55);
    await lobAssert.balance(licenseContract, 0, accounts.secondOwner, 15);
    await lobAssert.balance(licenseContract, 0, accounts.thirdOwner, 0);
    truffleAssert.eventEmitted(transaction, 'Transfer', (event) => {
      return event.issuanceNumber == 0 &&
        event.from == accounts.secondOwner &&
        event.to == accounts.firstOwner &&
        event.amount == 5 &&
        event.temporary == false;
    });
  });
});

contract("Temporary license transfer", function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  before(async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.sign("0x051381", {from: accounts.issuer});
    await licenseContract.issueLicense("Desc", "ID", /*originalValue=*/1000, accounts.firstOwner, 70, "Remark", 1509552789, {from:accounts.issuer, value: 500});
  });

  it("results in correct balances for both sides", async () => {
    const licenseContract = await LicenseContract.deployed();
    const transaction = await licenseContract.transferTemporarily(0, accounts.secondOwner, 20, {from: accounts.firstOwner});
    lobAssert.transactionCost(transaction, 140841, "transferTemporarily");
    await lobAssert.balance(licenseContract, 0, accounts.firstOwner, 50);
    await lobAssert.balance(licenseContract, 0, accounts.secondOwner, 20);
    await lobAssert.temporaryBalance(licenseContract, 0, accounts.firstOwner, 0);
    await lobAssert.temporaryBalance(licenseContract, 0, accounts.secondOwner, 20);
    await lobAssert.temporaryBalanceReclaimableBy(licenseContract, 0, accounts.firstOwner, accounts.firstOwner, 50);
    await lobAssert.temporaryBalanceReclaimableBy(licenseContract, 0, accounts.firstOwner, accounts.secondOwner, 0);
    await lobAssert.temporaryBalanceReclaimableBy(licenseContract, 0, accounts.secondOwner, accounts.firstOwner, 20);
    await lobAssert.temporaryBalanceReclaimableBy(licenseContract, 0, accounts.secondOwner, accounts.secondOwner, 0);
    await lobAssert.relevantIssuances(licenseContract, accounts.firstOwner, [0]);
    await lobAssert.relevantIssuances(licenseContract, accounts.secondOwner, [0]);
    await lobAssert.temporaryLicenseHolders(licenseContract, 0, accounts.firstOwner, [accounts.secondOwner]);
    await lobAssert.temporaryLicenseHolders(licenseContract, 0, accounts.secondOwner, []);
  });

  it("allows the sender to reclaim the licenses in one piece", async () => {
    const licenseContract = await LicenseContract.deployed();
    const transaction = await licenseContract.reclaim(0, accounts.secondOwner, 20, {from: accounts.firstOwner});
    lobAssert.transactionCost(transaction, 22943, "reclaim");
    await lobAssert.balance(licenseContract, 0, accounts.firstOwner, 70);
    await lobAssert.balance(licenseContract, 0, accounts.secondOwner, 0);
    await lobAssert.temporaryBalance(licenseContract, 0, accounts.firstOwner, 0);
    await lobAssert.temporaryBalance(licenseContract, 0, accounts.secondOwner, 0);
    await lobAssert.temporaryBalanceReclaimableBy(licenseContract, 0, accounts.secondOwner, accounts.firstOwner, 0);
    await lobAssert.relevantIssuances(licenseContract, accounts.firstOwner, [0]);
    await lobAssert.relevantIssuances(licenseContract, accounts.secondOwner, [0]);
    await lobAssert.temporaryLicenseHolders(licenseContract, 0, accounts.firstOwner, [accounts.secondOwner]);
    await lobAssert.temporaryLicenseHolders(licenseContract, 0, accounts.secondOwner, []);
  });

  it("allows the sender to reclaim the licenses piece by piece", async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.transferTemporarily(0, accounts.secondOwner, 20, {from: accounts.firstOwner});
    await licenseContract.reclaim(0, accounts.secondOwner, 5, {from: accounts.firstOwner});
    await lobAssert.balance(licenseContract, 0, accounts.firstOwner, 55);
    await lobAssert.balance(licenseContract, 0, accounts.secondOwner, 15);
    await licenseContract.reclaim(0, accounts.secondOwner, 5, {from: accounts.firstOwner});
    await lobAssert.balance(licenseContract, 0, accounts.firstOwner, 60);
    await lobAssert.balance(licenseContract, 0, accounts.secondOwner, 10);
    await lobAssert.temporaryBalance(licenseContract, 0, accounts.firstOwner, 0);
    await lobAssert.temporaryBalance(licenseContract, 0, accounts.secondOwner, 10);
    await lobAssert.temporaryBalanceReclaimableBy(licenseContract, 0, accounts.secondOwner, accounts.firstOwner, 10);
  });

  it("emits the Transfer event", async () => {
    const licenseContract = await LicenseContract.deployed();
    const transaction = await licenseContract.transferTemporarily(0, accounts.secondOwner, 5, {from: accounts.firstOwner});
    
    truffleAssert.eventEmitted(transaction, 'Transfer', (event) => {
      return event.issuanceNumber == 0 &&
        event.from == accounts.firstOwner &&
        event.to == accounts.secondOwner &&
        event.amount == 5 &&
        event.temporary == true;
    });
  });

  it("emits the Reclaim event", async () => {
    const licenseContract = await LicenseContract.deployed();
    const transaction = await licenseContract.reclaim(0, accounts.secondOwner, 5, {from: accounts.firstOwner});
    
    truffleAssert.eventEmitted(transaction, 'Reclaim', (event) => {
      return event.issuanceNumber == 0 &&
        event.from == accounts.secondOwner &&
        event.to == accounts.firstOwner &&
        event.amount == 5;
    });
  });

  it("does not allow the temporary owner to transfer the licenses on", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.transfer(0, accounts.thirdOwner, 5, {from:accounts.secondOwner}));
  });

  it("does not allow the temporary owner to lend the licenses on", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.transferTemporarily(0, accounts.thirdOwner, 5, {from:accounts.secondOwner}));
  });

  it("does not work if the sender does not own enough licenses", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.transferTemporarily(0, accounts.secondOwner, 100, {from: accounts.firstOwner}));
  });

  it("does not allow anyone but the original owner to reclaim licenses", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.reclaim(0, accounts.secondOwner, 5, {from:accounts.thirdOwner}));
  });

  it("does not work if the license contract has been revoked", async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.revoke(0, "n/a", {from: accounts.issuer});
    await truffleAssert.fails(licenseContract.transferTemporarily(0, accounts.secondOwner, 10, {from: accounts.firstOwner}));
  });

  it("does not allow licenses to be reclaimed if the license contract has been revoked", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.reclaim(0, accounts.secondOwner, 5, {from: accounts.firstOwner}));
  });
});

contract("Revoking an issuing", function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  before(async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.sign("0x051381", {from: accounts.issuer});
  });

  it("cannot be performed by anyone but the issuer", async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.issueLicense("Desc2", "ID", /*originalValue=*/1000, accounts.firstOwner, 70, "Remark", 1509552789, {from:accounts.issuer, value: 500});
    await truffleAssert.fails(licenseContract.revoke(0, "n/a", {from: accounts.firstOwner}));
  });

  it("cannot be performed by the LOB root", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.issueLicense("Desc", "ID", /*originalValue=*/1000, accounts.firstOwner, 70, "Remark", 1509552789, {from:accounts.lobRoot, value: 500}));
  });

  it("cannot be performed by the LOB root owner if it has not taken over control", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.issueLicense("Desc", "ID", /*originalValue=*/1000, accounts.firstOwner, 70, "Remark", 1509552789, {from:accounts.lobRootOwner, value: 500}));
  });

  it("can be performed by the issuer", async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.issueLicense("Desc2", "ID", /*originalValue=*/1000, accounts.firstOwner, 70, "Remark", 1509552789, {from:accounts.issuer, value: 500});
    await licenseContract.revoke(0, "My revocation reason", {from: accounts.issuer});
    const issuance = new Issuance(await licenseContract.issuances(0));
    assert.equal(issuance.revoked, true);
    assert.equal(issuance.revocationReason, "My revocation reason");
  });

  it("does not allow license transfer after the revocation", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.transfer(0, accounts.secondOwner, 85, {from:accounts.firstOwner}));
  });

  it("emits the Revoke event", async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.issueLicense("Desc2", "ID", /*originalValue=*/1000, accounts.firstOwner, 70, "Remark", 1509552789, {from:accounts.issuer, value: 500});
    const transaction = await licenseContract.revoke(1, "My revocation reason", {from: accounts.issuer});
    truffleAssert.eventEmitted(transaction, 'Revoke', (event) => {
      return event.issuanceNumber == 1;
    });
  });
});

contract("Disabling the license contract", function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  before(async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.sign("0x051381", {from: accounts.issuer});
    await licenseContract.issueLicense("Desc", "ID", /*originalValue=*/1000, accounts.firstOwner, 70, "Remark", 1509552789, {from:accounts.issuer, value: 500});
  });

  it("cannot be performed by anyone else", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.disable({from: accounts.firstOwner}));
  });

  it("cannot be done by the LOB root", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.disable({from: accounts.lobRoot}));
  });

  it("cannot be done by the LOB root owner", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.disable({from: accounts.lobRootOwner}));
  });

  it("can be done by the issuer", async () => {
    const licenseContract = await LicenseContract.deployed();
    const transaction = await licenseContract.disable({from: accounts.issuer});
    assert.equal(await licenseContract.disabled(), true);
    truffleAssert.eventEmitted(transaction, 'Disabling');
  });

  it("does not allow the issuance of licenses after the contract has been disabled", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.issueLicense("Desc", "ID", /*originalValue=*/1000, accounts.firstOwner, 70, "Remark", 1509552789, {from:accounts.issuer}));
  });

  it("does not allow issuances to be revoked after the contract has been disabled", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.revoke(0, "revocation reason", {from: accounts.issuer}));
  });
});

contract("Setting the issuance fee factor", function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  it("can be performed by the LOB root", async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.setIssuanceFeeFactor(10000, {from: accounts.lobRoot});
    assert.equal(await licenseContract.issuanceFeeFactor(), 10000);
  });

  it("cannot be done by anyone but the LOB root", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.setIssuanceFeeFactor(700, {from: accounts.issuer}));
  });

  it("emits the IssuanceFeeFactorChange event", async () => {
    const licenseContract = await LicenseContract.deployed();
    const transaction = await licenseContract.setIssuanceFeeFactor(20000, {from: accounts.lobRoot});
    truffleAssert.eventEmitted(transaction, 'IssuanceFeeFactorChange', (event) => {
      return event.newFeeFactor == 20000;
    });
  });
});

contract("Taking over management", function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  before(async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.sign("0x051381", {from: accounts.issuer});
    await licenseContract.issueLicense("Desc", "ID", /*originalValue=*/1000, accounts.firstOwner, 70, "Remark", 1509552789, {from:accounts.issuer, value: 7000});
    await licenseContract.issueLicense("Desc2", "ID2", /*originalValue=*/1000, accounts.firstOwner, 100, "Remark2", 1509552789, {from:accounts.issuer, value: 7000});
  });

  it("cannot be done by anyone but the LOB root", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.takeOverManagementControl(accounts.issuer, {from: accounts.issuer}));
  });

  it("can be done by the LOB root", async () => {
    const licenseContract = await LicenseContract.deployed();
    const transaction = await licenseContract.takeOverManagementControl(accounts.manager, {from: accounts.lobRoot});
    assert.equal(await licenseContract.managerAddress(), accounts.manager);
    truffleAssert.eventEmitted(transaction, 'ManagementControlTakeOver', (event) => {
      return event.managerAddress == accounts.manager;
    });
  });

  it("disallows the issuer to issue licenses", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.issueLicense("Desc", "ID", /*originalValue=*/1000, accounts.firstOwner, 70, "Remark", 1509552789, {from:accounts.issuer, value: 7000}));
  });

  it("disallows the issuer to revoke licenses", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.revoke(0, "", {from: accounts.issuer}));
  });

  it("disallows the issuer to disable the license contract", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.disable({from: accounts.issuer}));
  });

  it("allows the manager to revoke licenses", async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.revoke(0, "", {from: accounts.manager});
    assert.equal(new Issuance(await licenseContract.issuances(0)).revoked, true);
  });

  it("does not allow the LOB root to issue licenses", async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.issueLicense("Desc", "ID", /*originalValue=*/1000, accounts.firstOwner, 70, "Remark", 1509552789, {from:accounts.manager, value: 7000}));
  });

  it("allows the LOB root to disable the license contract", async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.disable({from: accounts.manager});
    assert.equal(await licenseContract.disabled(), true);
  });

  it("allows the manager to revoke licenses even if the license contract has been disabled", async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.revoke(1, "", {from: accounts.manager});
    assert.equal(new Issuance(await licenseContract.issuances(1)).revoked, true);
  });
});

contract('Transfer fee', function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  before(async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.sign("0x051381", {from: accounts.issuer});
    await licenseContract.setIssuanceFeeFactor(0, {from: accounts.lobRoot});
  });

  it('is initially 0', async () => {
    const licenseContract = await LicenseContract.deployed();
    assert.equal(await licenseContract.getTransferFeeTiersCount(), 0);
    assert.equal(await licenseContract.getTransferFee(0), 0);
    assert.equal(await licenseContract.getTransferFee(1000), 0);
  });

  it('cannot be set by anyone but the LOB root', async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.setTransferFeeTiers([0], [1], {from: accounts.issuer}));
  });

  it('can be set by the LOB root', async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.setTransferFeeTiers([0, 1000], [100, 50], {from: accounts.lobRoot});
    await lobAssert.transferFeeTiers(licenseContract, [[0, 100], [1000, 50]]);

    // Extend the transfer fees
    await licenseContract.setTransferFeeTiers([0, 1000, 2000], [100, 50, 40], {from: accounts.lobRoot});
    await lobAssert.transferFeeTiers(licenseContract, [[0, 100], [1000, 50], [2000, 40]]);

    // Remove tiers
    await licenseContract.setTransferFeeTiers([20], [30], {from: accounts.lobRoot});
    await lobAssert.transferFeeTiers(licenseContract, [[20, 30]]);

    // Remove all tiers
    await licenseContract.setTransferFeeTiers([], [], {from: accounts.lobRoot});
    await lobAssert.transferFeeTiers(licenseContract, []);
  });

  it('emits the transfer fee tiers change event', async () => {
    const licenseContract = await LicenseContract.deployed();
    const transaction = await licenseContract.setTransferFeeTiers([0, 1000], [100, 50], {from: accounts.lobRoot});
    truffleAssert.eventEmitted(transaction, 'TransferFeeTiersChange', (event) => {
      // Arrays need to be compared memberwise because the event has arrays of BNs which are only directly comparable to Numbers
      return event.minimumLicenseValues.length == 2 &&
        event.minimumLicenseValues[0] == 0 &&
        event.minimumLicenseValues[1] == 1000 &&
        event.fees.length == 2 &&
        event.fees[0] == 100 &&
        event.fees[1] == 50;
    })
  });

  it('fails if more fees than mimimumLicenseValues are passed', async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.setTransferFeeTiers([0], [100, 200], {from: accounts.issuer}));
  });

  it('fails if less fees than mimimumLicenseValues are passed', async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.setTransferFeeTiers([0, 1000], [100], {from: accounts.lobRoot}));
  });

  it('fails if the tiers are not sorted in ascending order', async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.setTransferFeeTiers([0, 1000, 500], [100, 50, 70], {from: accounts.lobRoot}));
  });

  it('works if the fee goes up again', async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.setTransferFeeTiers([0, 1000, 2000], [100, 50, 70], {from: accounts.lobRoot});
    await lobAssert.transferFeeTiers(licenseContract, [[0, 100], [1000, 50], [2000, 70]]);
  });

  it('fails if the same minimumLicenseValue is used twice', async () => {
    const licenseContract = await LicenseContract.deployed();
    await truffleAssert.fails(licenseContract.setTransferFeeTiers([100, 100], [100, 50], {from: accounts.lobRoot}));
  })

  it('are correctly computed using getTransferFee', async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.setTransferFeeTiers([0, 1000, 2000], [100, 50, 40], {from: accounts.lobRoot});

    assert.equal(await licenseContract.getTransferFee(0), 0 * 1000);
    assert.equal(await licenseContract.getTransferFee(100), 1 * 1000);
    assert.equal(await licenseContract.getTransferFee(199), 1 * 1000);
    assert.equal(await licenseContract.getTransferFee(200), 2 * 1000);
    assert.equal(await licenseContract.getTransferFee(1000), 5 * 1000);
    assert.equal(await licenseContract.getTransferFee(1200), 6 * 1000);
    assert.equal(await licenseContract.getTransferFee(2000), 8 * 1000);
    assert.equal(await licenseContract.getTransferFee(200000), 800 * 1000);
  });

  it('are chosen from the next transfer fee tier if that reduces the transfer fee', async () => {
    const licenseContract = await LicenseContract.deployed();

    assert.equal(await licenseContract.getTransferFee(900), 5 * 1000);
  });

  it('is required to transfer licenses', async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.setTransferFeeTiers([0, 10000, 20000], [100, 50, 40], {from: accounts.lobRoot});
    // 0€ => 1%
    // 100€ => 0.5%
    // 200€ => 0.4%
    
    await licenseContract.issueLicense("Desc", "Code", /*originalValue=*/1000, accounts.firstOwner, 20, "Remark", 1509552789, {from: accounts.issuer, value: 7000});
    // Issuance number: 0
    // Original value = 10€

    // Required transfer fee for 1 license: 10€ * 1% = 10ct = 10000 Wei (1ct = 1000 Wei in EtherPriceOracleStub)
    // Required transfer fee per license for 10 license: 10€ * 0.5% = 5ct = 5000 Wei (1ct = 1000 Wei in EtherPriceOracleStub)
    await truffleAssert.fails(licenseContract.transfer(0, accounts.secondOwner, 1, {from: accounts.firstOwner, value: 0}));
    await truffleAssert.fails(licenseContract.transfer(0, accounts.secondOwner, 1, {from: accounts.firstOwner, value: 9000}));
    await truffleAssert.passes(licenseContract.transfer(0, accounts.secondOwner, 1, {from: accounts.firstOwner, value: 10000}));
    await truffleAssert.fails(licenseContract.transfer(0, accounts.secondOwner, 2, {from: accounts.firstOwner, value: 10000}));
    await truffleAssert.passes(licenseContract.transfer(0, accounts.secondOwner, 2, {from: accounts.firstOwner, value: 20000}));
    await truffleAssert.fails(licenseContract.transfer(0, accounts.secondOwner, 10, {from: accounts.firstOwner, value: 40000}));
    await truffleAssert.passes(licenseContract.transfer(0, accounts.secondOwner, 10, {from: accounts.firstOwner, value: 50000}));
    const transaction = await licenseContract.transfer(0, accounts.secondOwner, 1, {from: accounts.firstOwner, value: 50000})
    lobAssert.transactionCost(transaction, 64011, "license transfer with fee");

    await lobAssert.balance(licenseContract, 0, accounts.firstOwner, 20 - 1 - 2 - 10 - 1);
    await lobAssert.balance(licenseContract, 0, accounts.secondOwner, 1 + 2 + 10 + 1);
  });

  it('drop to 0 if the transfer fee is less than 1ct', async () => {
    // This is due to integer rounding in Solidity

    const licenseContract = await LicenseContract.deployed();
    await licenseContract.setTransferFeeTiers([0], [100], {from: accounts.lobRoot});
    // Transfer fee: 1%

    const transaction = await licenseContract.issueLicense("Desc", "Code", /*originalValue=*/10, accounts.firstOwner, 20, "Remark", 1509552789, {from: accounts.issuer, value: 7000});
    truffleAssert.eventEmitted(transaction, 'Issuing', (event) => {
       return event.issuanceNumber == 1;
    });

    // Transfer fee is 0,10€ * 1% = 0,1ct -> 0ct => 0 Wei
    await truffleAssert.passes(licenseContract.transfer(1, accounts.secondOwner, 1, {from: accounts.firstOwner, value: 0}));
  });

  it('is computed correctly if the license value multiplied by the fee may overflow', async () => {
    // A license value of 2^63 still fits into the field, but multiplying it while calculating fees might cause overflows

    const licenseContract = await LicenseContract.deployed();
    await licenseContract.setTransferFeeTiers([0], [2], {from: accounts.lobRoot});

    const twoToThe63 = (new BigNumber(2)).exponentiatedBy(63);
    const transaction = await licenseContract.issueLicense("Desc", "Code", /*originalValue=*/twoToThe63.toFixed(), accounts.firstOwner, 20, "Remark", 1509552789, {from: accounts.issuer, value: 7000});
    truffleAssert.eventEmitted(transaction, 'Issuing', (event) => {
      return event.issuanceNumber.toNumber() === 2;
    });

    // Required transfer fee: 2^63€ * 0.02% ~= 1.8 * 10^15 € = a lot of Wei > 10000 Wei
    await truffleAssert.fails(licenseContract.transfer(2, accounts.secondOwner, 1, {from: accounts.firstOwner, value: 10000}));
  });

  it('is computed correctly if the license value multiplied by the amount may overflow', async () => {
    // A license value of 2^63 still fits into the field, but multiplying it when transferring multiple licenses may overflow
    const licenseContract = await LicenseContract.deployed();

    await truffleAssert.fails(licenseContract.transfer(2, accounts.secondOwner, 2, {from: accounts.firstOwner, value: 10000}));
  });

  it('is not required to be paid when destroying licenses', async () => {
    const licenseContract = await LicenseContract.deployed();

    await licenseContract.setTransferFeeTiers([0], [5000], {from: accounts.lobRoot});
    const transaction = await licenseContract.issueLicense("Desc", "Code", 1000, accounts.firstOwner, 20, "Remark", 1509552789, {from: accounts.issuer, value: 7000});
    truffleAssert.eventEmitted(transaction, 'Issuing', (event) => {
      return event.issuanceNumber.toNumber() === 3;
    });

    await truffleAssert.passes(licenseContract.transfer(3, accounts.zero, 2, {from: accounts.firstOwner, value: 0}));
  });

  it('is transferred to the LOB root when destorying licenses', async () => {
    const licenseContract = await LicenseContract.deployed();

    const oldLobRootBalance = new BigNumber(await web3.eth.getBalance(accounts.lobRoot));

    await truffleAssert.passes(licenseContract.transfer(3, accounts.zero, 2, {from: accounts.firstOwner, value: 20000}));

    const newLobRootBalance = new BigNumber(await web3.eth.getBalance(accounts.lobRoot));
    assert.equal(newLobRootBalance.minus(oldLobRootBalance).toNumber(), 20000);
  });
});

contract('Issuer transfer fee share', function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  before(async () => {
    const licenseContract = await LicenseContract.deployed();
    await licenseContract.sign("0x051381", {from: accounts.issuer});
    await licenseContract.setIssuanceFeeFactor(0, {from: accounts.lobRoot});
  });

  it('is initially 0', async () => {
    const licenseContract = await LicenseContract.deployed();

    assert.equal(await licenseContract.issuerTransferFeeShare(), 0);
  });

  it('can be set by the lob root', async () => {
    const licenseContract = await LicenseContract.deployed();

    await licenseContract.setIssuerTransferFeeShare(500, {from: accounts.lobRoot});

    assert.equal(await licenseContract.issuerTransferFeeShare(), 500);
  });

  it('emits the IssuerTransferFeeShareChange event when changed', async () => {
    const licenseContract = await LicenseContract.deployed();

    const transaction = await licenseContract.setIssuerTransferFeeShare(500, {from: accounts.lobRoot});

    truffleAssert.eventEmitted(transaction, 'IssuerTransferFeeShareChange', (event) => {
      return event.newShare == 500;
    })
  });

  it('can be set to 100%', async () => {
    const licenseContract = await LicenseContract.deployed();

    await licenseContract.setIssuerTransferFeeShare(10000, {from: accounts.lobRoot});

    assert.equal(await licenseContract.issuerTransferFeeShare(), 10000);
  });

  it('cannot be set to more than 100%', async () => {
    const licenseContract = await LicenseContract.deployed();

    await truffleAssert.fails(licenseContract.setIssuerTransferFeeShare(11000, {from: accounts.lobRoot}));
  });

  it('are divided between issuer and LOB', async () => {
    const licenseContract = await LicenseContract.deployed();
    const etherPriceOracle = await EtherPriceOracleStub.deployed();
    await licenseContract.setIssuerTransferFeeShare(8000, {from: accounts.lobRoot}); // 50%
    await licenseContract.setTransferFeeTiers([0], [100], {from: accounts.lobRoot});
    // Transfer fee: 1%

    await licenseContract.issueLicense("Desc", "Code", /*originalValue=*/1000, accounts.firstOwner, 20, "Remark", 1509552789, {from: accounts.issuer, value: 7000});
    // Issusance number: 0

    const oldIssuerBalance = new BigNumber(await web3.eth.getBalance(accounts.issuer));
    const oldLobRootBalance = new BigNumber(await web3.eth.getBalance(accounts.lobRoot));

    // Transfer fee per license: 10€ * 1% = 0.10€ = 10000 Wei

    await licenseContract.transfer(0, accounts.secondOwner, 1, {from: accounts.firstOwner, value: 10000});

    const newIssuerBalance = new BigNumber(await web3.eth.getBalance(accounts.issuer));
    const newLobRootBalance = new BigNumber(await web3.eth.getBalance(accounts.lobRoot));

    assert.equal(newIssuerBalance.minus(oldIssuerBalance).toNumber(), 10000 * 0.8);
    assert.equal(newLobRootBalance.minus(oldLobRootBalance).toNumber(), 10000 * 0.2);
  });

  it('divides superflous fees between LOB and the issuer', async () => {
    const licenseContract = await LicenseContract.deployed();
    const etherPriceOracle = await EtherPriceOracleStub.deployed();
    
    const oldIssuerBalance = new BigNumber(await web3.eth.getBalance(accounts.issuer));
    const oldLobRootBalance = new BigNumber(await web3.eth.getBalance(accounts.lobRoot));

    // Transfer fee per license: 10€ * 1% = 0.10€ = 10000 Wei
    
    await licenseContract.transfer(0, accounts.secondOwner, 1, {from: accounts.firstOwner, value: 15000});

    const newIssuerBalance = new BigNumber(await web3.eth.getBalance(accounts.issuer));
    const newLobRootBalance = new BigNumber(await web3.eth.getBalance(accounts.lobRoot));

    assert.equal(newIssuerBalance.minus(oldIssuerBalance).toNumber(), 15000 * 0.8);
    assert.equal(newLobRootBalance.minus(oldLobRootBalance).toNumber(), 15000 * 0.2);
  });

  it('is correctly divided when destorying licenses', async () => {
    const licenseContract = await LicenseContract.deployed();
    const etherPriceOracle = await EtherPriceOracleStub.deployed();
    
    const oldIssuerBalance = new BigNumber(await web3.eth.getBalance(accounts.issuer));
    const oldLobRootBalance = new BigNumber(await web3.eth.getBalance(accounts.lobRoot));

    // Transfer fee per license: 10€ * 1% = 0.10€ = 10000 Wei
    
    await licenseContract.transfer(0, accounts.zero, 1, {from: accounts.firstOwner, value: 15000});

    const newIssuerBalance = new BigNumber(await web3.eth.getBalance(accounts.issuer));
    const newLobRootBalance = new BigNumber(await web3.eth.getBalance(accounts.lobRoot));

    assert.equal(newIssuerBalance.minus(oldIssuerBalance).toNumber(), 15000 * 0.8);
    assert.equal(newLobRootBalance.minus(oldLobRootBalance).toNumber(), 15000 * 0.2);
  });
});
