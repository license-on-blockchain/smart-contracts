var LicenseContract = artifacts.require("LicenseContract");
var LicenseContractLib = artifacts.require("LicenseContractLib");
var RootContract = artifacts.require("RootContract");
var Accounts = require('../test/lib/Accounts.js');

module.exports = function(deployer, network, unnamedAccounts) {
  const accounts = Accounts.getNamed(unnamedAccounts);
  deployer.deploy(LicenseContractLib);
  deployer.link(LicenseContractLib, [LicenseContract, RootContract]);
  deployer.deploy(LicenseContract, accounts.issuer, "Soft&Cloud", "We are not liable for anything!", 10, '0x0ce8', 500/*wei*/, {from: accounts.lobRoot});
  deployer.deploy(RootContract, {from: accounts.lobRootOwner});
};
