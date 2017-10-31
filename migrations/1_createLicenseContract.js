var LicenseContract = artifacts.require("./LicenseContract.sol");
var RootContract = artifacts.require("./RootContract.sol");

module.exports = function(deployer, network, accounts) {
  accounts = require("../accounts.js")(accounts);
  deployer.deploy(LicenseContract, accounts.issuer, "Soft&Cloud", '0x0ce8', 500/*wei*/, {from: accounts.lobRoot});
  deployer.deploy(RootContract, {from: accounts.lobRootOwner});
};
