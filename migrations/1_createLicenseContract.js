const EtherPriceOracleStub = artifacts.require("EtherPriceOracleStub");
const LicenseContract = artifacts.require("LicenseContract");
const LicenseContractLib = artifacts.require("LicenseContractLib");
const RootContract = artifacts.require("RootContract");
const Accounts = require('../test/lib/Accounts.js');

module.exports = async function(deployer, network, unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);
  
  await deployer.deploy(EtherPriceOracleStub);
  const etherPriceOracle = (await EtherPriceOracleStub.deployed()).address;

  await deployer.deploy(LicenseContractLib);
  await deployer.link(LicenseContractLib, [LicenseContract, RootContract]);
  await deployer.deploy(LicenseContract, accounts.issuer, "Soft&Cloud", "We are not liable for anything!", 10, '0x0ce8', etherPriceOracle, {from: accounts.lobRoot});
  const licenseContract = await LicenseContract.deployed();
  await licenseContract.setIssuanceFee(500, {from: accounts.lobRoot});
  await deployer.deploy(RootContract, etherPriceOracle, {from: accounts.lobRootOwner});
};
