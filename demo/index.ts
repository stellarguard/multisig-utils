import {
  getMultisigServerEndpoint,
  needsMoreSignatures,
  StellarGuardResponse,
  submitToMultisigServer
} from '../src/';

import 'babel-polyfill';

import { TransactionStellarUri } from '@stellarguard/stellar-uri';
import { Network, Server, Transaction } from 'stellar-sdk';

const server = new Server('https://horizon-testnet.stellar.org');
Network.useTestNetwork();

const $xdr = document.querySelector('textarea') as HTMLTextAreaElement;
const $form = document.querySelector('form') as HTMLFormElement;
const $log = document.querySelector('#log');

const demoXdr =
  'AAAAAHFd0+HQV5u/Y/fM3+VelUr1IWwSFL8CUDIAUudUdD4MAAAAZAADyI8AAAADAAAAAAAAAAAAAAABAAAAAAAAAAEAAAAAcV3T4dBXm79j98zf5V6VSvUhbBIUvwJQMgBS51R0PgwAAAAAAAAAAACYloAAAAAAAAAAAVR0PgwAAABAEw8ODG0iixkbAHg1aJATAnZS2531PhGauuSvFDad2WxHKzIenUNbc7K5mGiSpe5jvqe19OQCbNFuBjqN11jfBw==';

init();

function init(): void {
  $xdr.value = demoXdr;

  $form.removeEventListener('submit', onSubmit);
  $form.addEventListener('submit', onSubmit);
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
  const transaction = new Transaction(xdr);
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
      if (result.stellarGuard) {
        const stellarGuardResponse = result as StellarGuardResponse;
        log(
          `Submitted to StellarGuard. Go to ${
            stellarGuardResponse.url
          } to authorize. (The demo user is stellarguard-demo@mailinator.com/stellarguard)`
        );
      } else {
        log(
          `Successfully submitted to multisig server: ${JSON.stringify(result)}`
        );
      }
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
