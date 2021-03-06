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

Given('I open the bot', function (callback) {
  this.bot.connect();
  callback();
});

When('I write /start for the first time', function (callback) {
  this.bot.read(function(data) {
    console.log('Received: ' + data);
    callback();
  });
  this.bot.send('/start\n')
});

Then('I must see the /lang keyboard', function (callback) {
  // Write code here that turns the phrase above into concrete actions
  callback(null, 'pending');
});
