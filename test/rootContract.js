const truffleAssert = require('truffle-assertions');
const BigNumber = require('bignumber.js');
const lobAssert = require('./lib/lobAssert.js');
const Accounts = require('./lib/Accounts.js');

const LicenseContract = artifacts.require("./LicenseContract.sol");
const RootContract = artifacts.require("./RootContract.sol");

contract("Root contract constructor", function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  it("sets the owner to the message sender", async () => {
    const rootContract = await RootContract.deployed();
    assert.equal(await rootContract.owner(), accounts.lobRootOwner);
  })
});

contract("Root contract default issuance fee", function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  it("is initially set to 0", async () => {
    const rootContract = await RootContract.deployed();
    assert.equal(await rootContract.defaultIssuanceFee(), 0);
  });

  it("cannot be changed from any address but the owner", async () => {
    const rootContract = await RootContract.deployed();
    await truffleAssert.fails(rootContract.setDefaultIssuanceFee(500, {from:accounts.firstOwner}));
  });

  it("can be changed by the owner", async () => {
    const rootContract = await RootContract.deployed();
    await rootContract.setDefaultIssuanceFee(800, {from: accounts.lobRootOwner});
    assert.equal(await rootContract.defaultIssuanceFee(), 800);
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
    const creationLogs = transaction.logs.filter(function(log) {return log.event == "LicenseContractCreation"});
    assert.equal(creationLogs.length, 1);
    const creationLog = creationLogs[0];
    const licenseContractAddress = creationLog.args.licenseContractAddress;
    licenseContract = await LicenseContract.at(licenseContractAddress);
    await licenseContract.sign("0x50", {from: accounts.issuer});
    await licenseContract.issueLicense("Desc", "ID", accounts.firstOwner, 70, "Remark", 1509552789, {from:accounts.issuer, value: 500});
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

contract("Setting a license contract's issuance fee", function(unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);

  let rootContract;
  let licenseContract;

  before(async () => {
    rootContract = await RootContract.deployed();
    const transaction = await rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer});
    const creationLogs = transaction.logs.filter(function(log) {return log.event == "LicenseContractCreation"});
    assert.equal(creationLogs.length, 1);
    const creationLog = creationLogs[0];
    const licenseContractAddress = creationLog.args.licenseContractAddress;
    licenseContract = await LicenseContract.at(licenseContractAddress);
  });

  it("cannot be done by anyone but the root contract owner", async () => {
    await truffleAssert.fails(rootContract.setLicenseContractIssuanceFee(licenseContract.address, 50, {from: accounts.firstOwner}));
  });

  it("can be done by the root contract owner", async () => {
    await rootContract.setLicenseContractIssuanceFee(licenseContract.address, 50, {from: accounts.lobRootOwner})
    assert.equal(await licenseContract.issuanceFee(), 50);
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
    await rootContract.setDefaultIssuanceFee(950, {from: accounts.lobRootOwner});
    const transaction = await rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer});
    const creationLogs = transaction.logs.filter(function(log) {return log.event == "LicenseContractCreation"});
    assert.equal(creationLogs.length, 1);
    const creationLog = creationLogs[0];
    const licenseContractAddress = creationLog.args.licenseContractAddress;
    licenseContract = await LicenseContract.at(licenseContractAddress);
  });


  it("does not consume too much gas", async () => {
    const transaction = await rootContract.createLicenseContract("Soft&Cloud", "Liability", 10, "0x5e789a", {from: accounts.issuer});
    lobAssert.transactionCost(transaction, 3747497, "createLicenseContract");
  });

  it("saves the license contract address in the root contract", async () => {
    assert.equal(await rootContract.licenseContractCount(), 2);
    assert.equal(await rootContract.licenseContracts(0), licenseContract.address);
  })

  it("has the LOB root set to the root contract", async () => {
    assert.equal(await licenseContract.lobRoot(), rootContract.address);
  });

  it("has the default issuance fee set as issuance fee", async () => {
    assert.equal(await licenseContract.issuanceFee(), 950);
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
    const creationLogs = transaction.logs.filter(function(log) {return log.event == "LicenseContractCreation"});
    assert.equal(creationLogs.length, 1);
    const creationLog = creationLogs[0];
    const licenseContractAddress = creationLog.args.licenseContractAddress;
    licenseContract = await LicenseContract.at(licenseContractAddress);
  });

  it("cannot be initiated by anyone but the root contract's owner", async () => {
    await truffleAssert.fails(rootContract.takeOverLicenseContractControl(licenseContract.address, accounts.manager, {from: accounts.issuer}));
  })

  it("can be initiated by the root contract's owner", async () => {
    await rootContract.takeOverLicenseContractControl(licenseContract.address, accounts.manager, {from: accounts.lobRootOwner});
    assert.equal(await licenseContract.managerAddress(), accounts.manager);
  });
});
