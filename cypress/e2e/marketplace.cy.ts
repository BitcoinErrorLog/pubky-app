describe('marketplace', () => {
  it('browses the public catalog and filters sandbox inventory', () => {
    cy.visit('/marketplace');
    cy.contains('h1', 'Find something rare.').should('be.visible');
    cy.contains('Pubky Marketplace').should('be.visible');
    cy.get('input[placeholder="Search items, styles, or sellers"]').should('be.visible');

    cy.get('body').then(($body) => {
      if ($body.text().includes('Sandbox · no real funds')) {
        cy.contains('8 items').should('be.visible');
        cy.get('input[placeholder="Search items, styles, or sellers"]').type('camera');
        cy.contains('1 item').should('be.visible');
        cy.contains('35mm rangefinder camera').should('be.visible');
        cy.contains('Vintage leather boots').should('not.exist');
        cy.contains('button', 'Clear').click();
        cy.contains('8 items').should('be.visible');
      } else {
        cy.contains('Marketplace transactions are unavailable in this deployment.').should('be.visible');
      }
    });
  });

  it('keeps seller and transaction routes authentication protected', () => {
    cy.visit('/marketplace/sell');
    cy.location('pathname').should('not.eq', '/marketplace/sell');

    cy.visit('/marketplace/cart');
    cy.location('pathname').should('not.eq', '/marketplace/cart');
  });
});
