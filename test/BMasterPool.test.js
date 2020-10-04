const { expectRevert, time } = require('@openzeppelin/test-helpers');
const LightToken = artifacts.require('LightToken');
const LightMain = artifacts.require('LightMain');
const MockERC20 = artifacts.require('MockERC20');

contract('LightMain', ([alice, bob, carol, dev, minter]) => {
    beforeEach(async () => {
        this.lightToken = await LightToken.new({ from: alice });
    });

    it('should set correct state variables', async () => {
        this.lightMain = await LightMain.new(this.lightToken.address, '1', '10', '0', '100000', '10000000', '1000000000', { from: alice });
        await this.lightToken.transferOwnership(this.lightMain.address, { from: alice });
        const lightToken = await this.lightMain.light();
        const owner = await this.lightToken.owner();
        assert.equal(lightToken.valueOf(), this.lightToken.address);
        assert.equal(owner.valueOf(), this.lightMain.address);
    });

    context('With ERC/LP token added to the field', () => {
        beforeEach(async () => {
            this.lp = await MockERC20.new('LPToken', 'LP', '10000000000', { from: minter });
            await this.lp.transfer(alice, '1000', { from: minter });
            await this.lp.transfer(bob, '1000', { from: minter });
            await this.lp.transfer(carol, '1000', { from: minter });
            this.lp2 = await MockERC20.new('LPToken2', 'LP2', '10000000000', { from: minter });
            await this.lp2.transfer(alice, '1000', { from: minter });
            await this.lp2.transfer(bob, '1000', { from: minter });
            await this.lp2.transfer(carol, '1000', { from: minter });
        });

        it('should allow emergency withdraw', async () => {
            // 10 per block farming rate starting at block 100
            this.lightMain = await LightMain.new(this.lightToken.address, '1', '10', '100', '100000', '10000000', '1000000000', { from: alice });
            await this.lightMain.add('100', this.lp.address, true, false);
            await this.lp.approve(this.lightMain.address, '1000', { from: bob });
            await this.lightMain.deposit(0, '100', { from: bob });
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '900');
            await this.lightMain.emergencyWithdraw(0, { from: bob });
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '1000');
        });

        it('should give out blockReward only after farming time', async () => {
            // 8000 per block farming rate starting at block 100
            this.lightMain = await LightMain.new(this.lightToken.address, '1', '10000', '100', '100', '500', '10000000000000000', { from: alice });
            assert.equal((await this.lightMain.getBlockReward(0, 0)).valueOf(), '0');
            assert.equal((await this.lightMain.getBlockReward(99, 0)).valueOf(), '0');
            assert.equal((await this.lightMain.getBlockReward(100, 0)).valueOf(), '8000');
            assert.equal((await this.lightMain.getBlockReward(199, 0)).valueOf(), '8000');
            assert.equal((await this.lightMain.getBlockReward(200, 0)).valueOf(), '4000');
            assert.equal((await this.lightMain.getBlockReward(300, 0)).valueOf(), '2000');
            assert.equal((await this.lightMain.getBlockReward(400, 0)).valueOf(), '1000');
            assert.equal((await this.lightMain.getBlockReward(500, 0)).valueOf(), '500');
            assert.equal((await this.lightMain.getBlockReward(599, 0)).valueOf(), '500');
            assert.equal((await this.lightMain.getBlockReward(600, 0)).valueOf(), '0');
            assert.equal((await this.lightMain.getBlockReward(10000000000000, 0)).valueOf(), '0');

            assert.equal((await this.lightMain.getBlockRewards(9, 99, 0)).valueOf(), '0');
            assert.equal((await this.lightMain.getBlockRewards(199, 201, 0)).valueOf(), '12000');
            assert.equal((await this.lightMain.getBlockRewards(598, 666, 0)).valueOf(), '500');
            assert.equal((await this.lightMain.getBlockRewards(401, 411, 0)).valueOf(), '10000');
        });

        it('should give out LIGHTs only after farming time', async () => {
            // 8000 per block farming rate starting at block 100
            this.lightMain = await LightMain.new(this.lightToken.address, '1', '10000', '500', '100', '50000', '10000000000000000', { from: alice });
            await this.lightToken.transferOwnership(this.lightMain.address, { from: alice });
            await this.lightMain.add('100', this.lp.address, true, false);
            await this.lp.approve(this.lightMain.address, '1000', { from: bob });
            await this.lightMain.deposit(0, '100', { from: bob });
            await time.advanceBlockTo('489');
            await this.lightMain.deposit(0, '0', { from: bob }); // block 490
            assert.equal((await this.lightToken.balanceOf(bob)).valueOf(), '0');
            await time.advanceBlockTo('494');
            await this.lightMain.deposit(0, '0', { from: bob }); // block 495
            assert.equal((await this.lightToken.balanceOf(bob)).valueOf(), '0');
            await time.advanceBlockTo('499');
            await this.lightMain.deposit(0, '0', { from: bob }); // block 500
            assert.equal((await this.lightToken.balanceOf(bob)).valueOf(), '0');
            await time.advanceBlockTo('500');
            await this.lightMain.deposit(0, '0', { from: bob }); // block 501
            assert.equal((await this.lightToken.balanceOf(bob)).valueOf(), '8000');
            await time.advanceBlockTo('504');
            await this.lightMain.deposit(0, '0', { from: bob }); // block 505
            assert.equal((await this.lightToken.balanceOf(bob)).valueOf(), '40000');
            assert.equal((await this.lightToken.totalSupply()).valueOf(), '40000');
        });

        it('should not distribute LIGHTs if no one deposit', async () => {
            // 8000 per block farming rate starting at block 600
            this.lightMain = await LightMain.new(this.lightToken.address, '1', '10000', '600', '1000', '50000', '10000000000000000', { from: alice });
            await this.lightToken.transferOwnership(this.lightMain.address, { from: alice });
            await this.lightMain.add('100', this.lp.address, true, false);
            await this.lp.approve(this.lightMain.address, '1000', { from: bob });
            await time.advanceBlockTo('599');
            assert.equal((await this.lightToken.totalSupply()).valueOf(), '0');
            await time.advanceBlockTo('604');
            assert.equal((await this.lightToken.totalSupply()).valueOf(), '0');
            await time.advanceBlockTo('609');
            await this.lightMain.deposit(0, '10', { from: bob }); // block 610
            assert.equal((await this.lightToken.totalSupply()).valueOf(), '0');
            assert.equal((await this.lightToken.balanceOf(bob)).valueOf(), '0');
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '990');
            await time.advanceBlockTo('619');
            await this.lightMain.withdraw(0, '10', { from: bob }); // block 620
            assert.equal((await this.lightToken.totalSupply()).valueOf(), '80000');
            assert.equal((await this.lightToken.balanceOf(bob)).valueOf(), '80000');
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '1000');
        });

        it('should distribute LIGHTs properly for each staker', async () => {
            // 1000 per block farming rate starting at block 700
            this.lightMain = await LightMain.new(this.lightToken.address, '1', '1250', '700', '1000', '50000', '10000000000000000', { from: alice });
            await this.lightToken.transferOwnership(this.lightMain.address, { from: alice });
            await this.lightMain.add('100', this.lp.address, true, false);
            await this.lp.approve(this.lightMain.address, '1000', { from: alice });
            await this.lp.approve(this.lightMain.address, '1000', { from: bob });
            await this.lp.approve(this.lightMain.address, '1000', { from: carol });
            // Alice deposits 10 LPs at block 710
            await time.advanceBlockTo('709');
            await this.lightMain.deposit(0, '10', { from: alice });
            // Bob deposits 20 LPs at block 714
            await time.advanceBlockTo('713');
            await this.lightMain.deposit(0, '20', { from: bob });
            // Carol deposits 30 LPs at block 718
            await time.advanceBlockTo('717');
            await this.lightMain.deposit(0, '30', { from: carol });
            // Alice deposits 10 more LPs at block 720. At this point:
            //   Alice should have: 4*1000 + 4*1/3*1000 + 2*1/6*1000 = 5666
            //   LightMain should have the remaining: 10000 - 5666 = 4334
            await time.advanceBlockTo('719');
            await this.lightMain.deposit(0, '10', { from: alice });
            assert.equal((await this.lightToken.totalSupply()).valueOf(), '10000');

            assert.equal((await this.lightToken.balanceOf(alice)).valueOf(), '5666');
            assert.equal((await this.lightToken.balanceOf(bob)).valueOf(), '0');
            assert.equal((await this.lightToken.balanceOf(carol)).valueOf(), '0');
            assert.equal((await this.lightToken.balanceOf(this.lightMain.address)).valueOf(), '4334');
            // Bob withdraws 5 LPs at block 730. At this point:
            //   Bob should have: 4*2/3*1000 + 2*2/6*1000 + 10*2/7*1000 = 6190
            await time.advanceBlockTo('729')
            await this.lightMain.withdraw(0, '5', { from: bob });
            assert.equal((await this.lightToken.totalSupply()).valueOf(), '20000');
            assert.equal((await this.lightToken.balanceOf(alice)).valueOf(), '5666');
            assert.equal((await this.lightToken.balanceOf(bob)).valueOf(), '6190');
            assert.equal((await this.lightToken.balanceOf(carol)).valueOf(), '0');
            assert.equal((await this.lightToken.balanceOf(this.lightMain.address)).valueOf(), '8144');
            // Alice withdraws 20 LPs at block 740.
            // Bob withdraws 15 LPs at block 750.
            // Carol withdraws 30 LPs at block 760.
            await time.advanceBlockTo('739')
            await this.lightMain.withdraw(0, '20', { from: alice });
            await time.advanceBlockTo('749')
            await this.lightMain.withdraw(0, '15', { from: bob });
            await time.advanceBlockTo('759')
            await this.lightMain.withdraw(0, '30', { from: carol });
            assert.equal((await this.lightToken.totalSupply()).valueOf(), '50000');
            // Alice should have: 5666 + 10*2/7*1000 + 10*2/6.5*1000 = 11600
            assert.equal((await this.lightToken.balanceOf(alice)).valueOf(), '11600');
            // Bob should have: 6190 + 10*1.5/6.5 * 1000 + 10*1.5/4.5*1000 = 11831
            assert.equal((await this.lightToken.balanceOf(bob)).valueOf(), '11831');
            // Carol should have: 2*3/6*1000 + 10*3/7*1000 + 10*3/6.5*1000 + 10*3/4.5*1000 + 10*1000 = 26568
            assert.equal((await this.lightToken.balanceOf(carol)).valueOf(), '26568');
            // All of them should have 1000 LPs back.
            assert.equal((await this.lp.balanceOf(alice)).valueOf(), '1000');
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '1000');
            assert.equal((await this.lp.balanceOf(carol)).valueOf(), '1000');
        });

        it('should give proper LIGHTs allocation to each pool', async () => {
            // 100 per block farming rate starting at block 800
            this.lightMain = await LightMain.new(this.lightToken.address, '1', '1250', '800', '1000', '50000', '10000000000000000', { from: alice });
            await this.lightToken.transferOwnership(this.lightMain.address, { from: alice });
            await this.lp.approve(this.lightMain.address, '1000', { from: alice });
            await this.lp2.approve(this.lightMain.address, '1000', { from: bob });
            // Add first LP to the pool with allocation 1
            await this.lightMain.add('10', this.lp.address, true, false);
            // Alice deposits 10 LPs at block 810
            await time.advanceBlockTo('809');
            await this.lightMain.deposit(0, '10', { from: alice });
            // Add LP2 to the pool with allocation 2 at block 820
            await time.advanceBlockTo('819');
            await this.lightMain.add('20', this.lp2.address, true, false);
            // Alice should have 10*1000 pending reward
            assert.equal((await this.lightMain.pendingLight(0, alice)).valueOf(), '10000');
            // Bob deposits 10 LP2s at block 825
            await time.advanceBlockTo('824');
            await this.lightMain.deposit(1, '5', { from: bob });
            // Alice should have 10000 + 5*1/3*1000 = 11666 pending reward
            assert.equal((await this.lightMain.pendingLight(0, alice)).valueOf(), '11666');
            await time.advanceBlockTo('830');
            // At block 430. Bob should get 5*2/3*1000 = 3333. Alice should get ~1666 more.
            assert.equal((await this.lightMain.pendingLight(0, alice)).valueOf(), '13333');
            assert.equal((await this.lightMain.pendingLight(1, bob)).valueOf(), '3333');
        });

        it('should half giving LIGHTs after halfblocks', async () => {
            // 100 per block farming rate starting at block 900
            this.lightMain = await LightMain.new(this.lightToken.address, '1', '250', '900', '100', '50000', '10000000000000000', { from: alice });
            await this.lightToken.transferOwnership(this.lightMain.address, { from: alice });
            await this.lp.approve(this.lightMain.address, '1000', { from: alice });
            await this.lightMain.add('1', this.lp.address, true, false);
            // Alice deposits 10 LPs at block 990
            await time.advanceBlockTo('989');
            await this.lightMain.deposit(0, '10', { from: alice });
            // At block 1005, she should have 200*10 + 100*5 = 2500 pending.
            await time.advanceBlockTo('1005');
            assert.equal((await this.lightMain.pendingLight(0, alice)).valueOf(), '2500');
            await this.lightMain.deposit(0, '0', { from: alice });
            assert.equal((await this.lightMain.pendingLight(0, alice)).valueOf(), '0');
            assert.equal((await this.lightToken.balanceOf(alice)).valueOf(), '2600');
        });
    });
});
