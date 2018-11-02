import test from 'ava';

import {
  Asset,
  Keypair,
  Network,
  Operation,
  Server,
  TransactionBuilder
} from 'stellar-sdk';
import {
  getSigners,
  hasAccountSignedTransaction,
  needsMoreSignatures,
  NeedsSignatures
} from './multisig';

const server = new Server('https://horizon-testnet.stellar.org');

// account with no additional signers
const basicAccount = Keypair.fromSecret(
  'SAHMBW53PCUXCQUBI7BTYV7SLBQXEWHERGDGQJVGFULMN43OCVBONARW'
);

// multisig, 1/1/1 threshold, 1 master weight, 1 additional signer, multisig_server: test.stellarguard.me
const twoSignersAccount = Keypair.fromSecret(
  'SCCZPCVAWXCHCTQ26PCCSOXEWUTDOTSF6UHEVYXYZXHKJ2V3UIN6A755'
);

// multisig, 2/2/2 threshold, 1 master weight, 1 additional signer, multisig_server: test.stellarguard.me
const multiSigAccount = Keypair.fromSecret(
  'SDOERPHI7YGP5ETZKFKW5GEUGWS7TCKBCQJERHXMRZOHE76Q2U2TY6XD'
);

// account that is additional signer for these other accounts
const signingAccount = Keypair.fromSecret(
  'SA2H6SM6TNVDQ4UORBQ4SEKFQ3S2BN74BXQEOWH6MCKVMUSPMPDPWFXI'
);

test.before(() => {
  Network.useTestNetwork();
});

test('needsAdditionalSignatures with basic account returns false when fully signed', async t => {
  const source = await server.loadAccount(basicAccount.publicKey());
  const transaction = new TransactionBuilder(source)
    .addOperation(
      Operation.payment({
        amount: '1',
        asset: Asset.native(),
        destination: basicAccount.publicKey()
      })
    )
    .build();

  transaction.sign(basicAccount);
  const additionalSignatures = await needsMoreSignatures(transaction, server);
  t.is(additionalSignatures, false);
});

test('needsAdditionalSignatures with basic account returns one account that needs signatures', async t => {
  const source = await server.loadAccount(basicAccount.publicKey());
  const transaction = new TransactionBuilder(source)
    .addOperation(
      Operation.payment({
        amount: '1',
        asset: Asset.native(),
        destination: basicAccount.publicKey()
      })
    )
    .build();

  const additionalSignatures = (await needsMoreSignatures(
    transaction,
    server
  )) as NeedsSignatures[];
  t.is(additionalSignatures.length, 1);

  const { account, currentWeight, requiredWeight } = additionalSignatures[0];
  t.is(account.id, basicAccount.publicKey());
  t.is(currentWeight, 0);
  t.is(requiredWeight, 1);
});

test('needsAdditionalSignatures with twoSignersAccount returns one account that needs signatures', async t => {
  const source = await server.loadAccount(twoSignersAccount.publicKey());
  const transaction = new TransactionBuilder(source)
    .addOperation(
      Operation.payment({
        amount: '1',
        asset: Asset.native(),
        destination: twoSignersAccount.publicKey()
      })
    )
    .build();

  const additionalSignatures = (await needsMoreSignatures(
    transaction,
    server
  )) as NeedsSignatures[];
  t.is(additionalSignatures.length, 1);

  const { account, currentWeight, requiredWeight } = additionalSignatures[0];
  t.is(account.id, twoSignersAccount.publicKey());
  t.is(currentWeight, 0);
  t.is(requiredWeight, 1);
});

test('needsAdditionalSignatures with twoSignersAccount returns false when the additional signer signs it', async t => {
  const source = await server.loadAccount(twoSignersAccount.publicKey());
  const transaction = new TransactionBuilder(source)
    .addOperation(
      Operation.payment({
        amount: '1',
        asset: Asset.native(),
        destination: twoSignersAccount.publicKey()
      })
    )
    .build();

  transaction.sign(signingAccount);

  const additionalSignatures = await needsMoreSignatures(transaction, server);
  t.is(additionalSignatures, false);
});

test('needsAdditionalSignatures with multisigAccount returns false when both signers sign it', async t => {
  const source = await server.loadAccount(multiSigAccount.publicKey());
  const transaction = new TransactionBuilder(source)
    .addOperation(
      Operation.payment({
        amount: '1',
        asset: Asset.native(),
        destination: multiSigAccount.publicKey()
      })
    )
    .build();

  transaction.sign(multiSigAccount, signingAccount);

  const additionalSignatures = await needsMoreSignatures(transaction, server);

  t.false(additionalSignatures);
});

test('needsAdditionalSignatures with multisigAccount returns the account that needs signatures when one signs it', async t => {
  const source = await server.loadAccount(multiSigAccount.publicKey());
  const transaction = new TransactionBuilder(source)
    .addOperation(
      Operation.payment({
        amount: '1',
        asset: Asset.native(),
        destination: multiSigAccount.publicKey()
      })
    )
    .build();

  transaction.sign(multiSigAccount);

  const additionalSignatures = (await needsMoreSignatures(
    transaction,
    server
  )) as NeedsSignatures[];

  t.is(additionalSignatures.length, 1);

  const { account, currentWeight, requiredWeight } = additionalSignatures[0];
  t.is(account.id, multiSigAccount.publicKey());
  t.is(currentWeight, 1);
  t.is(requiredWeight, 2);
});

test('needsAdditionalSignatures with multiple sources returns all accounts that need signatures', async t => {
  const source = await server.loadAccount(basicAccount.publicKey());
  const transaction = new TransactionBuilder(source)
    .addOperation(
      Operation.payment({
        amount: '1',
        asset: Asset.native(),
        destination: basicAccount.publicKey()
      })
    )
    .addOperation(
      Operation.payment({
        amount: '1',
        asset: Asset.native(),
        destination: twoSignersAccount.publicKey(),
        source: twoSignersAccount.publicKey()
      })
    )
    .addOperation(
      Operation.payment({
        amount: '1',
        asset: Asset.native(),
        destination: multiSigAccount.publicKey(),
        source: multiSigAccount.publicKey()
      })
    )
    .build();

  transaction.sign(basicAccount);

  const additionalSignatures = (await needsMoreSignatures(
    transaction,
    server
  )) as NeedsSignatures[];

  t.is(additionalSignatures.length, 2);

  const [first, second] = additionalSignatures;
  t.is(first.account.id, twoSignersAccount.publicKey());
  t.is(first.currentWeight, 0);
  t.is(first.requiredWeight, 1);

  t.is(second.account.id, multiSigAccount.publicKey());
  t.is(second.currentWeight, 0);
  t.is(second.requiredWeight, 2);
});

test('hasAccountSignedTransaction returns false when the account has not signed the transaction', async t => {
  const source = await server.loadAccount(basicAccount.publicKey());
  const transaction = new TransactionBuilder(source)
    .addOperation(
      Operation.payment({
        amount: '1',
        asset: Asset.native(),
        destination: basicAccount.publicKey()
      })
    )
    .build();

  transaction.sign(multiSigAccount);

  t.false(hasAccountSignedTransaction(basicAccount.publicKey(), transaction));
});

test('hasAccountSignedTransaction returns false when the transaction includes a signature for a different transaction', async t => {
  const source = await server.loadAccount(basicAccount.publicKey());
  const transaction = new TransactionBuilder(source)
    .addOperation(
      Operation.payment({
        amount: '1',
        asset: Asset.native(),
        destination: basicAccount.publicKey()
      })
    )
    .build();

  const otherTx = new TransactionBuilder(source)
    .addOperation(
      Operation.payment({
        amount: '2',
        asset: Asset.native(),
        destination: basicAccount.publicKey()
      })
    )
    .build();

  otherTx.sign(basicAccount);

  transaction.signatures.push(...otherTx.signatures);

  t.false(hasAccountSignedTransaction(basicAccount.publicKey(), transaction));
});

test('hasAccountSignedTransaction returns true when the transaction is signed by the user', async t => {
  const source = await server.loadAccount(basicAccount.publicKey());
  const transaction = new TransactionBuilder(source)
    .addOperation(
      Operation.payment({
        amount: '1',
        asset: Asset.native(),
        destination: basicAccount.publicKey()
      })
    )
    .build();

  transaction.sign(basicAccount);

  t.true(hasAccountSignedTransaction(basicAccount.publicKey(), transaction));
});

test('getSigners gets all signers for a transaction', async t => {
  const source = await server.loadAccount(basicAccount.publicKey());
  const transaction = new TransactionBuilder(source)
    .addOperation(
      Operation.payment({
        amount: '1',
        asset: Asset.native(),
        destination: basicAccount.publicKey()
      })
    )
    .addOperation(
      Operation.payment({
        amount: '1',
        asset: Asset.native(),
        destination: twoSignersAccount.publicKey(),
        source: twoSignersAccount.publicKey()
      })
    )
    .addOperation(
      Operation.payment({
        amount: '1',
        asset: Asset.native(),
        destination: multiSigAccount.publicKey(),
        source: multiSigAccount.publicKey()
      })
    )
    .build();

  transaction.sign(basicAccount);
  transaction.sign(twoSignersAccount);

  const signers = await getSigners(transaction, server);
  t.true(signers.length === 2, 'Should have 2 signers');
  t.true(signers.includes(basicAccount.publicKey()));
  t.true(signers.includes(twoSignersAccount.publicKey()));
});
