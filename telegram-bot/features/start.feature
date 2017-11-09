Feature: Simple /start

  Scenario: initial start
    Given I open the bot
    When I write /start for the first time
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
