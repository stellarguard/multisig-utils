import {
  AccountResponse,
  Keypair,
  Operation,
  Server,
  StellarTomlResolver,
  Transaction,
  TransactionOperation
} from 'stellar-sdk';

import axios from 'axios';

export enum ThresholdCategory {
  Low = 1,
  Medium = 2,
  High = 3
}

export interface AdditionalNeededSignature {
  account: AccountResponse;
  requiredWeight: number;
  currentWeight: number;
}

export async function needsAdditionalSignatures(
  transaction: Transaction,
  server: Server
): Promise<AdditionalNeededSignature[] | false> {
  const sourceAccounts = await getSourceAccounts(transaction, server);
  const thresholdCategories = getTransactionSourceThresholdCategories(
    transaction
  );
  const requiredWeights = getRequiredWeights(
    sourceAccounts,
    thresholdCategories
  );
  const signatureWeights = getSignatureWeights(transaction, sourceAccounts);
  const additionalSignaturesNeeded = getAccountsThatNeedAdditionalSignatures(
    signatureWeights,
    requiredWeights
  );
  if (additionalSignaturesNeeded.length === 0) {
    return false;
  } else {
    return additionalSignaturesNeeded;
  }
}

type Weight = number;

function getRequiredWeights(
  sourceAccounts: AccountResponse[],
  sourceThresholdCatgories: Map<string, ThresholdCategory>
): Map<AccountResponse, Weight> {
  const weights = new Map<AccountResponse, Weight>();
  sourceAccounts.forEach(account => {
    const thresholdType = sourceThresholdCatgories.get(account.id);
    const weight = getAccountThresholdWeight(account, thresholdType);
    weights.set(account, weight);
  });

  return weights;
}

function getAccountThresholdWeight(
  account: AccountResponse,
  thresholdType: ThresholdCategory
): Weight {
  let weight = 0;
  switch (thresholdType) {
    case ThresholdCategory.Low:
      weight = account.thresholds.low_threshold;
      break;
    case ThresholdCategory.Medium:
      weight = account.thresholds.med_threshold;
      break;
    case ThresholdCategory.High:
      weight = account.thresholds.high_threshold;
      break;
  }

  return Math.max(1, weight);
}

async function getSourceAccounts(
  transaction: Transaction,
  server: Server
): Promise<AccountResponse[]> {
  const sources = new Set<string>([transaction.source]);
  transaction.operations.forEach(operation => {
    if (operation.source) {
      sources.add(operation.source);
    }
  });

  return Promise.all(
    Array.from(sources).map(source => server.loadAccount(source))
  );
}

function getTransactionSourceThresholdCategories(
  transaction: Transaction
): Map<string, ThresholdCategory> {
  const sourceThresholds = new Map<string, ThresholdCategory>();
  sourceThresholds.set(transaction.source, ThresholdCategory.Medium);

  transaction.operations.forEach(operation => {
    const category = getThresholdCategory(operation);
    const source = operation.source || transaction.source;
    const previousCategory = sourceThresholds.get(source);
    if (previousCategory === undefined || category > previousCategory) {
      sourceThresholds.set(source, category);
    }
  });

  return sourceThresholds;
}

/**
 * Returns the threshold category (low, med, high) for a given operation.
 *
 * @param operation The operation for which to get the threshold category.
 */
export function getThresholdCategory(
  operation: TransactionOperation
): ThresholdCategory {
  const type = operation.type;
  if (type === 'allowTrust' || type === 'bumpSequence') {
    return ThresholdCategory.Low;
  }

  if (type === 'accountMerge') {
    return ThresholdCategory.High;
  }

  if (type === 'setOptions') {
    const op = operation as Operation.SetOptions;
    if (
      [
        op.masterWeight,
        op.lowThreshold,
        op.medThreshold,
        op.highThreshold,
        op.signer
      ].some(v => v !== undefined) // only certain things in set options require high
    ) {
      return ThresholdCategory.High;
    }
  }

  return ThresholdCategory.Medium;
}

/**
 * Contains how much weight an account currently has satisfied for the given transaction.
 */
interface AccountSignatureWeight {
  account: AccountResponse;
  currentWeight: Weight;
}

/**
 * Gets a list of accounts and current weights that have currently been signed on the transaction.
 *
 * @param transaction The transaction.
 * @param sourceAccounts An array of source accounts for this transaction.
 */
function getSignatureWeights(
  transaction: Transaction,
  sourceAccounts: AccountResponse[]
): AccountSignatureWeight[] {
  const map = new Map<AccountResponse, Weight>();
  sourceAccounts.forEach(account => {
    map.set(account, 0);
    account.signers.forEach(signer => {
      if (hasAccountSignedTransaction(signer.public_key, transaction)) {
        const previousWeight = map.get(account);
        map.set(account, previousWeight + signer.weight);
      }
    });
  });

  return Array.from(map.entries()).map(([account, currentWeight]) => ({
    account,
    currentWeight
  }));
}

export function hasAccountSignedTransaction(
  account: string,
  transaction: Transaction
): boolean {
  const keypair = Keypair.fromPublicKey(account);
  return transaction.signatures.some(signature => {
    return keypair.verify(transaction.hash(), signature.signature());
  });
}

function getAccountsThatNeedAdditionalSignatures(
  accountWeights: AccountSignatureWeight[],
  requiredWeights: Map<AccountResponse, Weight>
): AdditionalNeededSignature[] {
  return accountWeights
    .map(({ account, currentWeight }) => {
      const requiredWeight = requiredWeights.get(account);
      return { account, requiredWeight, currentWeight };
    })
    .filter(s => s.requiredWeight > s.currentWeight);
}

export async function getMultisigServerEndpoint(
  account: AccountResponse
): Promise<string | undefined> {
  const multisigServer = account.data_attr && account.data_attr.multisig_server;
  if (!multisigServer) {
    return undefined;
  }

  const url = Buffer.from(multisigServer, 'base64').toString();
  const toml = await StellarTomlResolver.resolve(url);
  return toml.MULTISIG_SERVER;
}

// tslint:disable-next-line:no-empty-interface
export interface MultisigServerResponse {}

export interface StellarGuardMultisigServerResponse
  extends MultisigServerResponse {
  /**
   * This indicates that the response is from StellarGuard
   */
  isStellarGuard: true;

  /**
   * The url to authorize the StellarGuard transaction
   */
  url: string;
}

/**
 * Submits a transaction to a multisig server endpoint.
 *
 * @param transaction The transaction to submit
 * @param multisigServerEndpoint The multisig endpoint to submit to.
 * @param options Additional options, such as a callback.
 */
export async function submitToMultisigServer(
  transaction: Transaction,
  multisigServerEndpoint: string,
  { callback }: { callback?: string } = {}
): Promise<MultisigServerResponse> {
  const xdr = transaction.toEnvelope().toXDR('base64');

  const response = await axios.post<MultisigServerResponse>(
    multisigServerEndpoint,
    { xdr, callback }
  );

  return response.data;
}
