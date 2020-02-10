import {
  Keypair,
  Network,
  Operation,
  Server,
  TransactionBuilder
} from 'stellar-sdk';

Network.useTestNetwork();
const server = new Server('https://horizon-testnet.stellar.org');

// account with no additional signers
const basicAccount = Keypair.fromSecret(
  'SAHMBW53PCUXCQUBI7BTYV7SLBQXEWHERGDGQJVGFULMN43OCVBONARW'
);

// multisig, 1/1/1 threshold, 1 master weight, 1 additional signer, multisig.domain: test.stellarguard.me
const twoSignersAccount = Keypair.fromSecret(
  'SCCZPCVAWXCHCTQ26PCCSOXEWUTDOTSF6UHEVYXYZXHKJ2V3UIN6A755'
);

// multisig, 2/2/2 threshold, 1 master weight, 1 additional signer, multisig.domain: test.stellarguard.me
const multiSigAccount = Keypair.fromSecret(
  'SDOERPHI7YGP5ETZKFKW5GEUGWS7TCKBCQJERHXMRZOHE76Q2U2TY6XD'
);

// account that is additional signer for these other accounts
const signingAccount = Keypair.fromSecret(
  'SA2H6SM6TNVDQ4UORBQ4SEKFQ3S2BN74BXQEOWH6MCKVMUSPMPDPWFXI'
);

initializeAccounts().then(() => console.log('done'));

async function initializeAccounts(): Promise<void> {
  await initializeBasicAccount();
  await initializeTwoSignersAccount();
  await initializeMultiSigAccount();
}

async function initializeBasicAccount(): Promise<void> {
  console.log(`Getting account: ${basicAccount.publicKey()}`);
  await server.loadAccount(basicAccount.publicKey());
}

async function initializeTwoSignersAccount(): Promise<void> {
  console.log(`Getting account: ${twoSignersAccount.publicKey()}`);
  const source = await server.loadAccount(twoSignersAccount.publicKey());
  const transaction = new TransactionBuilder(source, { fee: 100 })
    .addOperation(
      Operation.setOptions({
        signer: {
          ed25519PublicKey: signingAccount.publicKey(),
          weight: 1
        }
      })
    )
    .addOperation(
      Operation.manageData({
        name: 'multisig_server',
        value: 'test.stellarguard.me'
      })
    )
    .setTimeout(0)
    .build();

  transaction.sign(twoSignersAccount);
  await server.submitTransaction(transaction);
}

async function initializeMultiSigAccount(): Promise<void> {
  console.log(`Getting account: ${multiSigAccount.publicKey()}`);
  const source = await server.loadAccount(multiSigAccount.publicKey());
  const transaction = new TransactionBuilder(source, { fee: 100 })
    .addOperation(
      Operation.setOptions({
        signer: {
          ed25519PublicKey: signingAccount.publicKey(),
          weight: 1
        },
        // tslint:disable:object-literal-sort-keys
        lowThreshold: 2,
        medThreshold: 2,
        highThreshold: 2
      })
    )
    .addOperation(
      Operation.manageData({
        name: 'multisig_server',
        value: 'test.stellarguard.me'
      })
    )
    .setTimeout(0)
    .build();

  transaction.sign(multiSigAccount);
  await server.submitTransaction(transaction);
}
