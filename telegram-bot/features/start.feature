Feature: Simple /start

  @ignore
  Scenario: initial start
    Given connect to the bot
    When I write /start
    Then I must see the /lang keyboard

  Scenario Outline: i18n should work
    Given a lang set to '<lang>'
    Then '♥ Apoya esta iniciativa' should be translated to '<translation>' correctly
    Examples:
      | lang | translation                      |
      | ast  | ♥ Sofita esta iniciativa         |
      | en   | ♥ Support this initiative        |
      | es   | ♥ Apoya esta iniciativa          |
      | gl   | ♥ Apoia esta iniciativa          |
      | pt   | ♥ Contribui para esta iniciativa |
