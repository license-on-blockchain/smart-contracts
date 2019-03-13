const truffleAssert = require('truffle-assertions');
const BigNumber = require('bignumber.js');
const lobAssert = require('./lib/lobAssert.js');
const Accounts = require('./lib/Accounts.js');

const LicenseContract = artifacts.require("./LicenseContract.sol");
const RootContract = artifacts.require("./RootContract.sol");

async function getLicenseContract(creationTransation) {
  const creationLogs = creationTransation.logs.filter((log) => log.event == "LicenseContractCreation");
  assert.equal(creationLogs.length, 1);
  const creationLog = creationLogs[0];
  const licenseContractAddress = creationLog.args.licenseContractAddress;
  return await LicenseContract.at(licenseContractAddress);
}

contract("Root contract constructor", function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  it("sets the owner to the message sender", async () => {
    const rootContract = await RootContract.deployed();
    assert.equal(await rootContract.owner(), accounts.lobRootOwner);
  });
});

contract("Root contract registration fee", function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  it("is initially set to 0", async () => {
    const rootContract = await RootContract.deployed();
    assert.equal(await rootContract.registrationFee(), 0);
  });

  it("cannot be changed by an address that is not the owner", async () => {
    const rootContract = await RootContract.deployed();
    await truffleAssert.fails(rootContract.setRegistrationFee(900, {from: accounts.firstOwner}));
  });

  it("can be changed by the owner", async () => {
    const rootContract = await RootContract.deployed();
    await rootContract.setRegistrationFee(900, {from: accounts.lobRootOwner});
    assert.equal(await rootContract.registrationFee(), 900);
  });

  it("does not allow creating a license contract if not enough fee is passed", async () => {
    const rootContract = await RootContract.deployed();
    await truffleAssert.fails(rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer, value: 600}));
  });

  it("does allow creating a license contract if exactly the right fee is transmitted", async () => {
    const rootContract = await RootContract.deployed();
    await rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer, value: 900});
  });

  it("does allow creating a license contract if more than the required fee is transmitted", async () => {
    const rootContract = await RootContract.deployed();
    await rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer, value: 1100});
  });
});

contract("Root contract default issuance fee factor", function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  it("is initially set to 0", async () => {
    const rootContract = await RootContract.deployed();
    assert.equal(await rootContract.defaultIssuanceFeeFactor(), 0);
  });

  it("cannot be changed from any address but the owner", async () => {
    const rootContract = await RootContract.deployed();
    await truffleAssert.fails(rootContract.setDefaultIssuanceFeeFactor(5000, {from:accounts.firstOwner}));
  });

  it("can be changed by the owner", async () => {
    const rootContract = await RootContract.deployed();
    await rootContract.setDefaultIssuanceFeeFactor(5000, {from: accounts.lobRootOwner});
    assert.equal(await rootContract.defaultIssuanceFeeFactor(), 5000);
  });

  it('should be inherited by newly created license contract', async () => {
    const rootContract = await RootContract.deployed();
    const transaction = await rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer, value: 1100});
    const licenseContract = await getLicenseContract(transaction);
    assert.equal(await licenseContract.issuanceFeeFactor(), 5000);
  });
});

contract("Root contract owner", function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  it("cannot be changed by anyone but the current owner", async () => {
    const rootContract = await RootContract.deployed();
    await truffleAssert.fails(rootContract.setOwner(accounts.firstOwner, {from: accounts.secondOwner}));
  });

  it("can be changed by the current owner", async () => {
    const rootContract = await RootContract.deployed();
    await rootContract.setOwner(accounts.firstOwner, {from: accounts.lobRootOwner});
    assert.equal(await rootContract.owner(), accounts.firstOwner);
  });
});

contract("Withdrawal from license contracts", function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  let rootContract;
  let licenseContract;

  before(async () => {
    rootContract = await RootContract.deployed();
    const transaction = await rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer});
    licenseContract = await getLicenseContract(transaction);
    await licenseContract.sign("0x50", {from: accounts.issuer});
    await licenseContract.issueLicense("Desc", "ID", /*originalValue=*/1000, accounts.firstOwner, 70, "Remark", 1509552789, {from:accounts.issuer, value: 500});
  });

  it("cannot be done by anyone but the root contract owner", async () => {
    await truffleAssert.fails(rootContract.withdrawFromLicenseContract(licenseContract.address, 500, accounts.thirdOwner, {from: accounts.thirdOwner}));
  });

  it("cannot be done with root contract as recipient", async () => {
    await truffleAssert.fails(rootContract.withdrawFromLicenseContract(licenseContract.address, 500, rootContract.address, {from: accounts.lobRootOwner}));
  });

  it("can be done by the root contract owner", async () => {
    const originalBalance = await web3.eth.getBalance(accounts.thirdOwner);
    await rootContract.withdrawFromLicenseContract(licenseContract.address, 500, accounts.thirdOwner, {from: accounts.lobRootOwner});
    const newBalance = await web3.eth.getBalance(accounts.thirdOwner);
    const newBalanceNum = new BigNumber(newBalance);
    const originalBalanceNum = new BigNumber(originalBalance);
    assert.equal(newBalanceNum.minus(originalBalanceNum).toNumber(), 500);
  });
});

contract("Setting a license contract's issuance fee factor", function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  let rootContract;
  let licenseContract;

  before(async () => {
    rootContract = await RootContract.deployed();
    const transaction = await rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer});
    licenseContract = await getLicenseContract(transaction);
  });

  it("cannot be done by anyone but the root contract owner", async () => {
    await truffleAssert.fails(rootContract.setLicenseContractIssuanceFeeFactor(licenseContract.address, 7000, {from: accounts.firstOwner}));
  });

  it("can be done by the root contract owner", async () => {
    await rootContract.setLicenseContractIssuanceFeeFactor(licenseContract.address, 7000, {from: accounts.lobRootOwner});
    assert.equal(await licenseContract.issuanceFeeFactor(), 7000);
  });
});

contract("Root contract disabling", function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  it("cannot be done by anyone but the root contract owner", async () => {
    const rootContract = await RootContract.deployed();
    await truffleAssert.fails(rootContract.disable({from: accounts.issuer}));
  });

  it("can be done by the root contract owner", async () => {
    const rootContract = await RootContract.deployed();
    const transaction = await rootContract.disable({from: accounts.lobRootOwner});
    truffleAssert.eventEmitted(transaction, 'Disabling');
    assert.equal(await rootContract.disabled(), true);
  });
});

contract("Creating a new license contract", function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  let licenseContract;
  let rootContract;

  before(async () => {
    rootContract = await RootContract.deployed();
    await rootContract.setDefaultIssuanceFeeFactor(6000, {from: accounts.lobRootOwner});
    const transaction = await rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer});
    licenseContract = await getLicenseContract(transaction);
  });

  it("does not consume too much gas", async () => {
    const transaction = await rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer});
    lobAssert.transactionCost(transaction, 3347671, "createLicenseContract");
  });

  it("saves the license contract address in the root contract", async () => {
    assert.equal(await rootContract.licenseContractCount(), 2);
    assert.equal(await rootContract.licenseContracts(0), licenseContract.address);
  });

  it("has the LOB root set to the root contract", async () => {
    assert.equal(await licenseContract.lobRoot(), rootContract.address);
  });

  it("has the default issuance fee set as issuance fee", async () => {
    assert.equal(await licenseContract.issuanceFeeFactor(), 6000);
  });

  it("carries the issuer's name", async () => {
    assert.equal(await licenseContract.issuerName(), "Soft&Cloud");
  });

  it("carries the issuer's certificate", async () => {
    assert.equal(await licenseContract.issuerSSLCertificate(), "0x5e789a");
  });

  it("sets the license contract issuer to the caller of the root contract function", async () => {
    assert.equal(await licenseContract.issuer(), accounts.issuer);
  });

  it("cannot be done if root contract is disabled", async () => {
    await rootContract.disable({from: accounts.lobRootOwner});
    await truffleAssert.fails(rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer}));
  });
});

contract("License contract control takeover", function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  let rootContract;
  let licenseContract;

  before(async () => {
    rootContract = await RootContract.deployed();
    const transaction = await rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer});
    licenseContract = await getLicenseContract(transaction);
  });

  it("cannot be initiated by anyone but the root contract's owner", async () => {
    await truffleAssert.fails(rootContract.takeOverLicenseContractControl(licenseContract.address, accounts.manager, {from: accounts.issuer}));
  });

  it("can be initiated by the root contract's owner", async () => {
    await rootContract.takeOverLicenseContractControl(licenseContract.address, accounts.manager, {from: accounts.lobRootOwner});
    assert.equal(await licenseContract.managerAddress(), accounts.manager);
  });
});

contract("Transfer fees tiers", function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  it('are empty if no default is set', async () => {
    const rootContract = await RootContract.deployed();
    lobAssert.defaultTransferFeeTiers(rootContract, []);

    const transaction = await rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer});
    const licenseContract = await getLicenseContract(transaction);
    await lobAssert.transferFeeTiers(licenseContract, []);
  });

  it('can be changed per license contract', async () => {
    const rootContract = await RootContract.deployed();

    const transaction = await rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer});
    const licenseContract = await getLicenseContract(transaction);

    await lobAssert.transferFeeTiers(licenseContract, []);

    await rootContract.setLicenseContractTransferFeeTiers(licenseContract.address, [0, 1000], [100, 50], {from: accounts.lobRootOwner});
    await lobAssert.transferFeeTiers(licenseContract, [[0, 100], [1000, 50]]);
  });

  it('are inherited by a newly created license contract from the root contract\'s default', async () => {
    const rootContract = await RootContract.deployed();
    await rootContract.setDefaultTransferFeeTiers([0, 1000], [100, 50], {from: accounts.lobRootOwner});
    lobAssert.defaultTransferFeeTiers(rootContract, [[0, 100], [1000, 50]]);

    const transaction = await rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer});
    const licenseContract = await getLicenseContract(transaction);
    await lobAssert.transferFeeTiers(licenseContract, [[0, 100], [1000, 50]]);
  });

  it('defaults cannot be changed by anyone but the owner', async () => {
    const rootContract = await RootContract.deployed();
    await truffleAssert.fails(rootContract.setDefaultTransferFeeTiers([0, 1000], [100, 50], {from: accounts.firstOwner}));
  });
});

contract('Default transfer fee share', function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  it('is initially 0', async () => {
    const rootContract = await RootContract.deployed();

    assert.equal(await rootContract.defaultIssuerTransferFeeShare(), 0);
  });

  it('can be set by the root contract owner', async () => {
    const rootContract = await RootContract.deployed();

    await rootContract.setDefaultIssuerTransferFeeShare(5000, {from: accounts.lobRootOwner}); // 50%

    assert.equal(await rootContract.defaultIssuerTransferFeeShare(), 5000);
  });

  it('cannot be set by anyone but the root contact owner', async () => {
    const rootContract = await RootContract.deployed();

    await truffleAssert.fails(rootContract.setDefaultIssuanceFeeFactor(5000, {from: accounts.firstOwner}));
  });

  it('is inherited by newly created license contracts', async () => {
    const rootContract = await RootContract.deployed();

    assert.equal(await rootContract.defaultIssuerTransferFeeShare(), 5000);

    const transaction = await rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer});
    const licenseContract = await getLicenseContract(transaction);
    assert.equal(await licenseContract.issuerTransferFeeShare(), 5000);
  });
});
