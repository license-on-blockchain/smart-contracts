var LicenseContract = artifacts.require("./LicenseContract.sol");

module.exports = function(deployer, network, accounts) {
  accounts = require("../accounts.js")(accounts);
  deployer.deploy(LicenseContract, accounts.issuer, "Soft&Cloud", '0x0ce8', 500/*wei*/)
  var licenseContract;
  deployer.then(function() {
    return LicenseContract.deployed();
  }).then(function(instance) {
    return instance.sign("0x05138", {from: accounts.issuer});
  });
};
