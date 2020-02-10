import {
  getMultisigServerEndpoint,
  needsMoreSignatures,
  StellarGuardResponse,
  submitToMultisigServer
} from '../src/';

import 'babel-polyfill';

import { TransactionStellarUri } from '@stellarguard/stellar-uri';
import {
  AccountResponse,
  Asset,
  Keypair,
  Network,
  Networks,
  Operation,
  Server,
  Transaction,
  TransactionBuilder
} from 'stellar-sdk';

const server = new Server('https://horizon-testnet.stellar.org');
Network.useTestNetwork();

const $xdr = document.querySelector('textarea') as HTMLTextAreaElement;
const $form = document.querySelector('form') as HTMLFormElement;
const $log = document.querySelector('#log');

const keypair = Keypair.fromSecret(
  'SDZQUARBO43LWTFD3KHEZKP64A5MVTHHHFHTA42PZIVYYHGWNG7TKVQE'
);

const signingAccount =
  'GBTPNUSDRHLA2A3XLNTQ3DORGBW6QNA6SMKDYUBBM6KX63T4YVODCIZS';

function sleep(time: number): Promise<any> {
  return new Promise(resolve => {
    setTimeout(resolve, time);
  });
}

async function fundWithFriendBot(publicKey: string): Promise<AccountResponse> {
  try {
    await fetch(`https://friendbot.stellar.org/?addr=${publicKey}`);
    await sleep(15000); // give horizon some time to pick it up
  } catch (e) {
    console.log(e);
  }

  return server.loadAccount(publicKey);
}

async function loadAccount(): Promise<AccountResponse> {
  const publicKey = keypair.publicKey();
  try {
    return await server.loadAccount(publicKey);
  } catch (e) {
    const source = await fundWithFriendBot(publicKey);
    const transaction = new TransactionBuilder(source, {
      fee: 100,
      networkPassphrase: Networks.TESTNET
    })
      .addOperation(
        Operation.manageData({
          name: 'multisig.domain',
          value: 'test.stellarguard.me'
        })
      )
      .addOperation(
        Operation.setOptions({
          highThreshold: 20,
          lowThreshold: 20,
          masterWeight: 10,
          medThreshold: 20,
          signer: {
            ed25519PublicKey: signingAccount,
            weight: 10
          }
        })
      )
      .setTimeout(0)
      .build();

    transaction.sign(keypair);
    await server.submitTransaction(transaction);
    return source;
  }
}

init();

async function init(): Promise<void> {
  $form.removeEventListener('submit', onSubmit);
  $form.addEventListener('submit', onSubmit);
  const source = await loadAccount();
  const transaction = new TransactionBuilder(source, {
    fee: 100,
    networkPassphrase: Networks.TESTNET
  })
    .addOperation(
      Operation.payment({
        amount: '1',
        asset: Asset.native(),
        destination: keypair.publicKey()
      })
    )
    .setTimeout(0)
    .build();

  transaction.sign(keypair);
  $xdr.value = transaction.toEnvelope().toXDR('base64') as any;
}

async function onSubmit(ev: Event): Promise<void> {
  ev.preventDefault();
  ev.stopPropagation();

  reset();
  try {
    await submit($xdr.value);
    log('Success!');
  } catch (e) {
    log(`Error ${e}`);
  }
}

function reset(): void {
  $log.innerHTML = ``;
}

async function submit(xdr: string): Promise<any> {
  const transaction = new Transaction(xdr, Networks.TESTNET);
  log('Checking if the transaction requires more signatures...');
  const requiresSignatures = await needsMoreSignatures(transaction, server);
  if (requiresSignatures) {
    log(
      `Requires more signatures for: ${requiresSignatures.map(
        s => s.account.id
      )}`
    );
    const account = requiresSignatures[0].account;
    const multisigServerEndpoint = await getMultisigServerEndpoint(account);
    const stellarUri = TransactionStellarUri.forTransaction(transaction);
    log(`Generated SEP-0007 uri for submission: ${stellarUri.toString()}`);
    if (multisigServerEndpoint) {
      log(`Submitting to multisig server: ${multisigServerEndpoint}`);
      const result = await submitToMultisigServer(
        stellarUri.toString(),
        multisigServerEndpoint
      );
      if (result.extras && result.extras.isStellarGuard) {
        const stellarGuardResponse = result as StellarGuardResponse;
        log(
          `Submitted to StellarGuard. Go to ${
            stellarGuardResponse.extras.url
          } to authorize. (The demo user is stellarguard-demo@mailinator.com/stellarguard)`
        );
      } else {
        log(
          `Successfully submitted to multisig server: ${JSON.stringify(result)}`
        );
      }
      log(`Check the status at: ${result.statusHref}`);
    } else {
      log(
        `Requires more signature, but no multisig endpoint defined for ${
          account.id
        }`
      );
      // no multisig endpoint defined, do whatever you want with it:
      // - show SEP-007 url?
      // - submit to generic multisig server?
    }
  } else {
    log('No more signatures required, submitting to horizon.');
    return server.submitTransaction(transaction);
  }
}

function log(value): void {
  const $li = document.createElement('li');
  $li.innerText = value;
  $log.appendChild($li);
}
