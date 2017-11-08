const { Given, When, Then } = require('cucumber')
const { expect } = require('chai')

Given('a variable set to {int}', function(number) {
  this.setTo(number)
})

When('I increment the variable by {int}', function(number) {
  this.incrementBy(number)
})

Then('the variable should contain {int}', function(number) {
  expect(this.variable).to.eql(number)

  // this.changeLanguage('gl')

})

Given("a lang set to {string}", function (lang) {
  this.changeLanguage(lang);
});

Then('{string} should be translated to {string} correctly', function (something, translated) {
  expect(translated).to.eql(this.t(something));
  // callback(null, 'pending');
});
