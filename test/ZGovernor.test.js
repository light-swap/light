const { expectRevert, time } = require('@openzeppelin/test-helpers');
const ethers = require('ethers');
const LightToken = artifacts.require('LightToken');
const LightMain = artifacts.require('LightMain');
const Timelock = artifacts.require('Timelock');
const GovernorAlpha = artifacts.require('GovernorAlpha');
const MockERC20 = artifacts.require('MockERC20');

const Web3 = require('web3');
var web3 = new Web3();
web3.setProvider(new web3.providers.HttpProvider("http://127.0.0.1:7545"));

function encodeParameters(types, values) {
    const abi = new ethers.utils.AbiCoder();
    return abi.encode(types, values);
}

contract('Governor', ([alice, minter, dev]) => {
    it('should work', async () => {
        this.lightToken = await LightToken.new({ from: alice });
        // await this.lightToken.delegate(alice, { from: alice });
        this.lightMain = await LightMain.new(this.lightToken.address, '1', '125', '0', '5000', '25000', '420000000000000000000000', { from: alice });
        await this.lightToken.mint(minter, 1, { from: alice });
        await this.lightToken.transferOwnership(this.lightMain.address, { from: alice });
        this.lp = await MockERC20.new('LPToken', 'LP', '10000000000', { from: minter });
        this.lp2 = await MockERC20.new('LPToken2', 'LP2', '10000000000', { from: minter });
        await this.lightMain.add('100', this.lp.address, true, false, { from: alice });
        await this.lp.approve(this.lightMain.address, '1000', { from: minter });
        await this.lightMain.deposit(0, '100', { from: minter });
        // Perform another deposit to make sure some SUSHIs are minted in that 1 block.
        await this.lightMain.deposit(0, '100', { from: minter });
        assert.equal((await this.lightToken.totalSupply()).valueOf(), '101');
        assert.equal((await this.lightToken.balanceOf(minter)).valueOf(), '101');
        await this.lightToken.delegate(minter, { from: minter });
        // Transfer ownership to timelock contract
        this.timelock = await Timelock.new(alice, time.duration.days(2), { from: alice });
        this.gov = await GovernorAlpha.new(this.timelock.address, this.lightToken.address, alice, { from: alice });
        await this.timelock.setPendingAdmin(this.gov.address, { from: alice });
        await this.gov.__acceptAdmin({ from: alice });
        await this.lightMain.transferOwnership(this.timelock.address, { from: alice });
        await expectRevert(
            this.lightMain.add('100', this.lp2.address, true, false, { from: alice }),
            'Ownable: caller is not the owner',
        );
        await expectRevert(
            this.gov.propose(
                [this.lightMain.address], ['0'], ['add(uint256,address,bool,bool)'],
                [encodeParameters(['uint256', 'address', 'bool', 'bool'], ['100', this.lp2.address, true, false])],
                'Add LP2',
                { from: alice },
            ),
            'GovernorAlpha::propose: proposer votes below proposal threshold',
        );
        let number = await web3.eth.getBlockNumber();
        await this.gov.propose(
            [this.lightMain.address], ['0'], ['add(uint256,address,bool,bool)'],
            [encodeParameters(['uint256', 'address', 'bool', 'bool'], ['100', this.lp2.address, true, false])],
            'Add LP2',
            { from: minter },
        );
        await time.advanceBlock();
        await this.gov.castVote('1', true, { from: minter });
        await expectRevert(this.gov.queue('1'), "GovernorAlpha::queue: proposal can only be queued if it is succeeded");
        console.log("Advancing 17280 blocks. Will take a while...");
        for (let i = 0; i < 17280; ++i) {
            await time.advanceBlock();
        }
        await this.gov.queue('1');
        await expectRevert(this.gov.execute('1'), "Timelock::executeTransaction: Transaction hasn't surpassed time lock.");
        await time.increase(time.duration.days(3));
        await this.gov.execute('1');
        assert.equal((await this.lightMain.poolLength()).valueOf(), '2');
    });
});
