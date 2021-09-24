import { ethers } from 'hardhat'
import { solidity } from 'ethereum-waffle'
import { use, expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

import { Baal } from '../src/types/Baal'
import { TestErc20 } from '../src/types/TestErc20'
import { RageQuitBank } from '../src/types/RageQuitBank'

use(solidity)

// chai
//   .use(require('chai-as-promised'))
//   .should();

const revertMessages =  {
  molochConstructorShamanCannotBe0: 'shaman cannot be 0',
  molochConstructorGuildTokenCannotBe0: 'guildToken cannot be 0',
  molochConstructorSummonerCannotBe0: 'summoner cannot be 0',
  molochConstructorSharesCannotBe0: 'shares cannot be 0',
  molochConstructorMinVotingPeriodCannotBe0: 'minVotingPeriod cannot be 0',
  molochConstructorMaxVotingPeriodCannotBe0: 'maxVotingPeriod cannot be 0',
  submitProposalVotingPeriod: '!votingPeriod',
  submitProposalArrays: '!array parity',
  submitProposalArrayMax: 'array max',
  submitProposalFlag: '!flag',
  submitVoteTimeEnded: 'ended',
  proposalMisnumbered: '!exist'
}

const zeroAddress = '0x0000000000000000000000000000000000000000';

async function blockTime() {
  const block = await ethers.provider.getBlock('latest');
  return block.timestamp;
}

async function blockNumber() {
  const block = await ethers.provider.getBlock('latest');
  return block.number;
}

async function moveForwardPeriods(periods: number) {
  const goToTime = deploymentConfig.MIN_VOTING_PERIOD_IN_SECONDS * periods;
  await ethers.provider.send('evm_increaseTime', [goToTime]);
  return true;
}

const deploymentConfig = {
  'GRACE_PERIOD_IN_SECONDS': 43200,
  'MIN_VOTING_PERIOD_IN_SECONDS': 172800,
  'MAX_VOTING_PERIOD_IN_SECONDS': 432000,
  'TOKEN_NAME': 'wrapped ETH',
  'TOKEN_SYMBOL': 'WETH',
}

describe('Baal contract', function () {

  let baal: Baal;
  let weth: TestErc20
  let shaman: RageQuitBank;
  let applicant: SignerWithAddress;
  let summoner: SignerWithAddress;
  
  let proposal: { [key: string]: any};

  const loot = 500;
  const shares = 100;
  const sharesPaused = false;

  const yes = true;
  const no = false;

  beforeEach(async function () {
    const BaalContract = await ethers.getContractFactory('Baal');
    const ShamanContract = await ethers.getContractFactory('RageQuitBank');
    [summoner, applicant] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory("TestERC20");
    weth = (await ERC20.deploy("WETH", "WETH", 10000000)) as TestErc20;

    shaman = (await ShamanContract.deploy()) as RageQuitBank;
    
    baal = (await BaalContract.deploy(
      sharesPaused,
      deploymentConfig.GRACE_PERIOD_IN_SECONDS,
      deploymentConfig.MIN_VOTING_PERIOD_IN_SECONDS,
      deploymentConfig.MAX_VOTING_PERIOD_IN_SECONDS,
      deploymentConfig.TOKEN_NAME,
      deploymentConfig.TOKEN_SYMBOL,
      [weth.address],
      [shaman.address],
      [summoner.address],
      [loot],
      [shares]
    )) as Baal;

    await shaman.init(
      baal.address
    );

    proposal = {
      flag: 0,
      votingPeriod: 175000,
      account: summoner.address,
      value: 50,
      data: 10,
      details: 'all hail baal'
    }
  });

  describe('constructor', function () {
    it('verify deployment parameters', async function () {
      const now = await blockTime();

      const decimals = await baal.decimals();
      expect(decimals).to.equal(18);

      const gracePeriod = await baal.gracePeriod();
      expect(gracePeriod).to.equal(deploymentConfig.GRACE_PERIOD_IN_SECONDS);
      
      const minVotingPeriod = await baal.minVotingPeriod();
      expect(minVotingPeriod).to.equal(deploymentConfig.MIN_VOTING_PERIOD_IN_SECONDS);

      const maxVotingPeriod = await baal.maxVotingPeriod();
      expect(maxVotingPeriod).to.equal(deploymentConfig.MAX_VOTING_PERIOD_IN_SECONDS);

      const name = await baal.name();
      expect(name).to.equal(deploymentConfig.TOKEN_NAME);

      const symbol = await baal.symbol();
      expect(symbol).to.equal(deploymentConfig.TOKEN_SYMBOL);

      const lootPaused = await baal.lootPaused();
      expect(lootPaused).to.be.false;
  
      const sharesPaused = await baal.sharesPaused();
      expect(sharesPaused).to.be.false;

      const shamans = await baal.shamans(shaman.address);
      expect(shamans).to.be.true;

      const guildTokens = await baal.getGuildTokens();
      expect(guildTokens[0]).to.equal(weth.address);

      const summonerData = await baal.members(summoner.address);
      expect(summonerData.loot).to.equal(500);
      expect(summonerData.highestIndexYesVote).to.equal(0);

      const totalLoot = await baal.totalLoot();
      expect(totalLoot).to.equal(500);
    });
  });

  describe('memberAction', function () {
    it('happy case - verify loot', async function () {
      await baal.memberAction(shaman.address, loot / 2, shares / 2, true);
      const lootData = await baal.members(summoner.address);
      expect(lootData.loot).to.equal(1000);
    });

    it('happy case - verify shares', async function () {
      await baal.memberAction(shaman.address, loot / 2, shares / 2, true);
      const sharesData = await baal.balanceOf(summoner.address);
      expect(sharesData).to.equal(200);
    });
  });
  
  describe('submitProposal', function () {
    it('happy case', async function () {
      const countBefore = await baal.proposalCount();

      await baal.submitProposal(
        proposal.flag,
        proposal.votingPeriod,
        [proposal.account], 
        [proposal.value],
        [proposal.data],
        ethers.utils.id(proposal.details)
      );

      const countAfter = await baal.proposalCount();
      expect(countAfter).to.equal(countBefore.add(1));
    });

    it('require fail - voting period too low', async function() { 
      expect(baal.submitProposal(
        proposal.flag,
        deploymentConfig.MIN_VOTING_PERIOD_IN_SECONDS - 100,
        [proposal.account], 
        [proposal.value],
        [proposal.data],
        ethers.utils.id(proposal.details)
      )).to.be.revertedWith(revertMessages.submitProposalVotingPeriod);
    });

    it('require fail - voting period too high', async function() { 
      expect(baal.submitProposal(
        proposal.flag,
        deploymentConfig.MAX_VOTING_PERIOD_IN_SECONDS + 100,
        [proposal.account], 
        [proposal.value],
        [proposal.data],
        ethers.utils.id(proposal.details)
      )).to.be.revertedWith(revertMessages.submitProposalVotingPeriod);
    });

    it('require fail - to array does not match', async function() { 
      expect(baal.submitProposal(
        proposal.flag,
        deploymentConfig.MIN_VOTING_PERIOD_IN_SECONDS + 100,
        [proposal.account, summoner.address], 
        [proposal.value],
        [proposal.data],
        ethers.utils.id(proposal.details)
      )).to.be.revertedWith(revertMessages.submitProposalArrays);
    });

    it('require fail - value array does not match', async function() { 
      expect(baal.submitProposal(
        proposal.flag,
        deploymentConfig.MIN_VOTING_PERIOD_IN_SECONDS + 100,
        [proposal.account, summoner.address], 
        [proposal.value, 20],
        [proposal.data],
        ethers.utils.id(proposal.details)
      )).to.be.revertedWith(revertMessages.submitProposalArrays);
    });

    it('require fail - data array does not match', async function() { 
      expect(baal.submitProposal(
        proposal.flag,
        deploymentConfig.MIN_VOTING_PERIOD_IN_SECONDS + 100,
        [proposal.account, summoner.address], 
        [proposal.value],
        [proposal.data, 15],
        ethers.utils.id(proposal.details)
      )).to.be.revertedWith(revertMessages.submitProposalArrays);
    });

    it('require fail - flag is out of bounds', async function() { 
      expect(baal.submitProposal(
        6,
        deploymentConfig.MIN_VOTING_PERIOD_IN_SECONDS + 100,
        [proposal.account, summoner.address], 
        [proposal.value],
        [proposal.data],
        ethers.utils.id(proposal.details)
      )).to.be.revertedWith(revertMessages.submitProposalFlag);
    });
  });

  describe('submitVote', function () {
    beforeEach(async function () {
      await baal.submitProposal(
        proposal.flag,
        proposal.votingPeriod,
        [proposal.account], 
        [proposal.value],
        [proposal.data],
        ethers.utils.id(proposal.details)
      );
    });

    it('happy case - yes vote', async function() {
      const blockT = await blockTime();
      await baal.submitVote(1, yes);
      const prop = await baal.proposals(1);
      const priorVote = await baal.getPriorVotes(summoner.address, blockT);
      const nCheckpoints = await baal.numCheckpoints(summoner.address);
      const votes = (await baal.checkpoints(summoner.address, nCheckpoints.sub(1))).votes;
      expect(prop.yesVotes).to.equal(votes);
    });

    it('happy case - no vote', async function() {
      const blockT = await blockTime();
      await baal.submitVote(1, no);
      const prop = await baal.proposals(1);
      const priorVote = await baal.getPriorVotes(summoner.address, blockT);
      const nCheckpoints = await baal.numCheckpoints(summoner.address);
      const votes = (await baal.checkpoints(summoner.address, nCheckpoints.sub(1))).votes;
      expect(prop.noVotes).to.equal(votes);
    });

    it('require fail - voting period has ended', async function() {
      await moveForwardPeriods(2);
      expect(baal.submitVote(1, no))
        .to.be.revertedWith(revertMessages.submitVoteTimeEnded);
    });
  });

  describe('processProposal', function () {
    it('happy case - flag[0] - yes wins', async function () {
      const beforeProcessed = await baal.proposals(1);;
      await baal.submitProposal(
        proposal.flag,
        proposal.votingPeriod,
        [proposal.account], 
        [proposal.value],
        [proposal.data],
        ethers.utils.id(proposal.details)
      );
      await baal.submitVote(1, yes);
      await moveForwardPeriods(2);
      await baal.processProposal(1);
      const afterProcessed = await baal.proposals(1);
      expect(afterProcessed).to.deep.equal(beforeProcessed);
    });

    it('happy case - flag[1] - yes wins', async function () {
      await baal.submitProposal(
        proposal.flag + 1,
        proposal.votingPeriod,
        [proposal.account], 
        [proposal.value],
        [proposal.data],
        ethers.utils.id(proposal.details)
      );
      const lootBefore = (await baal.members(proposal.account)).loot;
      await baal.submitVote(1, yes);
      const yesVotes = (await baal.proposals(1)).yesVotes;
      await moveForwardPeriods(2);
      await baal.processProposal(1);
      const lootAfter = (await baal.members(proposal.account)).loot;
      expect(lootAfter).to.equal(lootBefore.add(yesVotes));
    });

    it('happy case - flag[2] - yes wins', async function () {
      const beforeProcessed = await baal.proposals(1);
      await baal.submitProposal(
        proposal.flag + 2,
        proposal.votingPeriod,
        [proposal.account], 
        [proposal.value, 0, 0, 0, 0],
        [proposal.data],
        ethers.utils.id(proposal.details)
      );
      await baal.submitVote(1, yes);
      await moveForwardPeriods(2);
      await baal.processProposal(1);
      const afterProcessed = await baal.proposals(1);
      expect(afterProcessed).to.deep.equal(beforeProcessed);
    });

    it('happy case - flag[3] - yes wins', async function () {
      const beforeProcessed = await baal.proposals(1);
      await baal.submitProposal(
        proposal.flag + 3,
        proposal.votingPeriod,
        [proposal.account], 
        [proposal.value],
        [proposal.data],
        ethers.utils.id(proposal.details)
      );
      await baal.submitVote(1, yes);
      await moveForwardPeriods(2);
      await baal.processProposal(1);
      const afterProcessed = await baal.proposals(1);
      expect(afterProcessed).to.deep.equal(beforeProcessed);
    });

    it('happy case - flag[0] - no wins', async function () {
      const beforeProcessed = await baal.proposals(1);
      await baal.submitProposal(
        proposal.flag,
        proposal.votingPeriod,
        [proposal.account], 
        [proposal.value],
        [proposal.data],
        ethers.utils.id(proposal.details)
      );
      await baal.submitVote(1, no);
      await moveForwardPeriods(2);
      await baal.processProposal(1);
      const afterProcessed = await baal.proposals(1);
      expect(afterProcessed).to.deep.equal(beforeProcessed);
    });

    it('happy case - flag[1] - no wins', async function () {
      await baal.submitProposal(
        proposal.flag + 1,
        proposal.votingPeriod,
        [proposal.account], 
        [proposal.value],
        [proposal.data],
        ethers.utils.id(proposal.details)
      );
      const lootBefore = (await baal.members(proposal.account)).loot;
      await baal.submitVote(1, no);
      const noVotes = (await baal.proposals(1)).noVotes;
      await moveForwardPeriods(2);
      await baal.processProposal(1);
      const lootAfter = (await baal.members(proposal.account)).loot;
      expect(lootAfter).to.equal(lootBefore.add(noVotes));

    });

    it('happy case - flag[2] - no wins', async function () {
      const beforeProcessed = await baal.proposals(1);
      await baal.submitProposal(
        proposal.flag + 2,
        proposal.votingPeriod,
        [proposal.account], 
        [proposal.value, 0, 0, 0, 0],
        [proposal.data],
        ethers.utils.id(proposal.details)
      );
      await baal.submitVote(1, no);
      await moveForwardPeriods(2);
      await baal.processProposal(1);
      const afterProcessed = await baal.proposals(1);
      expect(afterProcessed).to.deep.equal(beforeProcessed);
    });

    it('require fail - proposal does not exist', async function () {
      await baal.submitProposal(
        proposal.flag,
        proposal.votingPeriod,
        [proposal.account], 
        [proposal.value],
        [proposal.data],
        ethers.utils.id(proposal.details)
      );
      await baal.submitVote(1, yes);
      expect(baal.processProposal(2))
        .to.be.revertedWith('!exist');
    });

    it('require fail - voting period has not ended', async function () {
      await baal.submitProposal(
        proposal.flag,
        proposal.votingPeriod,
        [proposal.account], 
        [proposal.value],
        [proposal.data],
        ethers.utils.id(proposal.details)
      );
      await baal.submitVote(1, yes);
      await baal.submitProposal(
        proposal.flag,
        proposal.votingPeriod,
        [proposal.account], 
        [proposal.value],
        [proposal.data],
        ethers.utils.id(proposal.details)
      );
      await baal.submitVote(2, yes);
      await moveForwardPeriods(2);
      expect(baal.processProposal(2))
        .to.be.revertedWith('prev!processed');
    });
  });

  describe('ragequit', function () {
    beforeEach(async function () {
      await baal.submitProposal(
        proposal.flag,
        proposal.votingPeriod,
        [proposal.account], 
        [proposal.value],
        [proposal.data],
        ethers.utils.id(proposal.details)
      );
    });

    it('happy case - full ragequit', async function () {
      const lootBefore = (await baal.members(summoner.address)).loot;
      await baal.ragequit(summoner.address, loot, shares);
      const lootAfter = (await baal.members(summoner.address)).loot;
      expect(lootAfter).to.equal(lootBefore.sub(loot));
    });

    it('happy case - partial ragequit', async function () {
      const lootBefore = (await baal.members(summoner.address)).loot;
      const lootToBurn = 200;
      const sharesToBurn = 70;
      await baal.ragequit(summoner.address, lootToBurn, sharesToBurn);
      const lootAfter = (await baal.members(summoner.address)).loot;
      expect(lootAfter).to.equal(lootBefore.sub(lootToBurn));
    });

    it('require fail - proposal voting has not ended', async function () {
      const lootBefore = (await baal.members(summoner.address)).loot;
      await baal.submitVote(1, yes);
      expect(baal.ragequit(summoner.address, loot, shares))
        .to.be.revertedWith('processed');
    });
  });

  describe('getCurrentVotes', function () {
    it('happy case - account with votes', async function () {
      const currentVotes = await baal.getCurrentVotes(summoner.address);
      const nCheckpoints = await baal.numCheckpoints(summoner.address);
      const checkpoints = await baal.checkpoints(summoner.address, nCheckpoints.sub(1));
      const votes = checkpoints.votes;
      expect(currentVotes).to.equal(votes);
    });

    it('happy case - account without votes', async function () {
      const currentVotes = await baal.getCurrentVotes(shaman.address);
      expect(currentVotes).to.equal(0);
    });
  });

  describe('getPriorVotes', function () {
    beforeEach(async function () {
      await baal.submitProposal(
        proposal.flag,
        proposal.votingPeriod,
        [proposal.account], 
        [proposal.value],
        [proposal.data],
        ethers.utils.id(proposal.details)
      );
    });

    it('happy case - yes vote', async function (){
      const blockT = await blockTime();
      await baal.submitVote(1, yes);
      const priorVote = await baal.getPriorVotes(summoner.address, blockT);
      const nCheckpoints = await baal.numCheckpoints(summoner.address);
      const votes = (await baal.checkpoints(summoner.address, nCheckpoints.sub(1))).votes;
      expect(priorVote).to.equal(votes);
    });

    it('happy case - no vote', async function (){
      const blockT = await blockTime();
      await baal.submitVote(1, no);
      const priorVote = await baal.getPriorVotes(summoner.address, blockT);
      const nCheckpoints = await baal.numCheckpoints(summoner.address);
      const votes = (await baal.checkpoints(summoner.address, nCheckpoints.sub(1))).votes;
      expect(priorVote).to.equal(votes);
    });

    it('require fail - timestamp not determined', async function () {
      const blockT = await blockTime();
      expect(baal.getPriorVotes(summoner.address, blockT))
        .to.be.revertedWith('!determined');
    });
  });

  describe('getProposalFlags', function () {
    it('happy case - action type', async function (){
      await baal.submitProposal(
        proposal.flag,
        proposal.votingPeriod,
        [proposal.account], 
        [proposal.value],
        [proposal.data],
        ethers.utils.id(proposal.details)
      );

      const flags = await baal.getProposalFlags(1);
      expect(flags[proposal.flag]).to.be.true;
    });

    it('happy case - membership type', async function (){
      await baal.submitProposal(
        proposal.flag + 1,
        proposal.votingPeriod,
        [proposal.account], 
        [proposal.value],
        [proposal.data],
        ethers.utils.id(proposal.details)
      );

      const flags = await baal.getProposalFlags(1);
      expect(flags[proposal.flag + 1]).to.be.true;
    });

    it('happy case - period type', async function (){
      await baal.submitProposal(
        proposal.flag + 2,
        proposal.votingPeriod,
        [proposal.account], 
        [proposal.value, 0, 0, 0, 0],
        [proposal.data],
        ethers.utils.id(proposal.details)
      );

      const flags = await baal.getProposalFlags(1);
      expect(flags[proposal.flag + 2]).to.be.true;
    });

    it('happy case - whitelist type', async function (){
      await baal.submitProposal(
        proposal.flag + 3,
        proposal.votingPeriod,
        [proposal.account], 
        [proposal.value],
        [proposal.data],
        ethers.utils.id(proposal.details)
      );

      const flags = await baal.getProposalFlags(1);
      expect(flags[proposal.flag + 3]).to.be.true;
    });
  });
});