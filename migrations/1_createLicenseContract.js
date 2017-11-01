var LicenseContract = artifacts.require("./LicenseContract.sol");
var RootContract = artifacts.require("./RootContract.sol");

module.exports = function(deployer, network, accounts) {
  accounts = require("../accounts.js")(accounts);
  deployer.deploy(LicenseContract, accounts.issuer, "Soft&Cloud", "We are not liable for anything!", '0x0ce8', 10, 500/*wei*/, {from: accounts.lobRoot});
  deployer.deploy(RootContract, {from: accounts.lobRootOwner});
};
