const { expectRevert } = require('@openzeppelin/test-helpers');
const LightToken = artifacts.require('LightToken');

contract('LightToken', ([alice, bob, carol]) => {
    beforeEach(async () => {
        this.light = await LightToken.new({ from: alice });
    });

    it('should have correct name and symbol and decimal', async () => {
        const name = await this.light.name();
        const symbol = await this.light.symbol();
        const decimals = await this.light.decimals();
        assert.equal(name.valueOf(), 'LightToken');
        assert.equal(symbol.valueOf(), 'LIGHT');
        assert.equal(decimals.valueOf(), '18');
    });

    it('should only allow owner to mint token', async () => {
        await this.light.mint(alice, '100', { from: alice });
        await this.light.mint(bob, '1000', { from: alice });
        await expectRevert(
            this.light.mint(carol, '1000', { from: bob }),
            'Ownable: caller is not the owner',
        );
        const totalSupply = await this.light.totalSupply();
        const aliceBal = await this.light.balanceOf(alice);
        const bobBal = await this.light.balanceOf(bob);
        const carolBal = await this.light.balanceOf(carol);
        assert.equal(totalSupply.valueOf(), '1100');
        assert.equal(aliceBal.valueOf(), '100');
        assert.equal(bobBal.valueOf(), '1000');
        assert.equal(carolBal.valueOf(), '0');
    });

    it('should supply token transfers properly', async () => {
        await this.light.mint(alice, '100', { from: alice });
        await this.light.mint(bob, '1000', { from: alice });
        await this.light.transfer(carol, '10', { from: alice });
        await this.light.transfer(carol, '100', { from: bob });
        const totalSupply = await this.light.totalSupply();
        const aliceBal = await this.light.balanceOf(alice);
        const bobBal = await this.light.balanceOf(bob);
        const carolBal = await this.light.balanceOf(carol);
        assert.equal(totalSupply.valueOf(), '1100');
        assert.equal(aliceBal.valueOf(), '90');
        assert.equal(bobBal.valueOf(), '900');
        assert.equal(carolBal.valueOf(), '110');
    });

    it('should fail if you try to do bad transfers', async () => {
        await this.light.mint(alice, '100', { from: alice });
        await expectRevert(
            this.light.transfer(carol, '110', { from: alice }),
            'ERC20: transfer amount exceeds balance',
        );
        await expectRevert(
            this.light.transfer(carol, '1', { from: bob }),
            'ERC20: transfer amount exceeds balance',
        );
    });
  });
