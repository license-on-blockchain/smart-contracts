var LicenseContract = artifacts.require("LicenseContract");
var LicenseContractLib = artifacts.require("LicenseContractLib");
var RootContract = artifacts.require("RootContract");

module.exports = function(deployer, network, accounts) {
  accounts = require("../accounts.js")(accounts);
  deployer.deploy(LicenseContractLib);
  deployer.link(LicenseContractLib, [LicenseContract, RootContract]);
  deployer.deploy(LicenseContract, accounts.issuer, "Soft&Cloud", "We are not liable for anything!", '0x0ce8', 10, 500/*wei*/, {from: accounts.lobRoot});
  deployer.deploy(RootContract, {from: accounts.lobRootOwner});
};
