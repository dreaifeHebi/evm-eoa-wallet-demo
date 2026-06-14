import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  FileSignature,
  KeyRound,
  Lock,
  Network,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Unlock,
  WalletCards
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ethers } from "ethers";

type EoaWallet = ethers.Wallet | ethers.HDNodeWallet;
type TabId = "sign" | "typed" | "tx" | "rpc";

type Activity = {
  id: number;
  tone: "info" | "ok" | "warn" | "error";
  text: string;
  time: string;
};

type StructureRow = [string, string];

type StructureBlock = {
  title: string;
  rows?: StructureRow[];
  code?: string;
};

type RecoveredStructure = {
  title: string;
  tone: "info" | "ok" | "warn" | "error";
  rows: StructureRow[];
  blocks: StructureBlock[];
};

const VAULT_KEY = "eoa-wallet-lab:vault-json";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEFAULT_DERIVATION_PATH = "m/44'/60'/0'/0/0";

function makeNonce() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function defaultRpcUrl() {
  const configured = import.meta.env.VITE_RPC_URL;
  if (configured) return configured;

  if (globalThis.location?.protocol === "https:") {
    return new URL("/rpc", globalThis.location.origin).toString();
  }

  const host = globalThis.location?.hostname || "127.0.0.1";
  return `http://${host}:8545`;
}

function shortAddress(value?: string) {
  if (!value) return "No wallet";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function shortHex(value?: string, head = 14, tail = 10) {
  if (!value) return "";
  if (value.length <= head + tail) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function mnemonicPhrase(activeWallet: EoaWallet | null) {
  if (!activeWallet || !("mnemonic" in activeWallet) || !activeWallet.mnemonic) {
    return "Only mnemonic-backed HD wallets show a phrase.";
  }
  return activeWallet.mnemonic.phrase;
}

function jsonWithBigInt(value: unknown) {
  return JSON.stringify(
    value,
    (_, inner) => (typeof inner === "bigint" ? inner.toString() : inner),
    2
  );
}

function verificationStatus(expected: string | undefined, recovered: string | null) {
  if (!expected || !recovered) return "No wallet to compare";
  return expected.toLowerCase() === recovered.toLowerCase() ? "matched current wallet" : "different from current wallet";
}

function personalSignEnvelope(message: string) {
  const byteLength = ethers.toUtf8Bytes(message).length;
  return `0x19 || "Ethereum Signed Message:\\n${byteLength}" || utf8(message)`;
}

function receiptStatusLabel(status: number | null | undefined) {
  if (status === 1) return "Executed successfully";
  if (status === 0) return "Execution reverted";
  return "Included, status unknown";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatAccessList(accessList: ethers.AccessList | null) {
  return jsonWithBigInt(accessList || []);
}

function transactionEnvelopeExpression(parsed: ethers.Transaction) {
  if (parsed.type === 2) {
    return "0x02 || rlp([chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList, yParity, r, s])";
  }
  if (parsed.type === 1) {
    return "0x01 || rlp([chainId, nonce, gasPrice, gasLimit, to, value, data, accessList, yParity, r, s])";
  }
  return "rlp([nonce, gasPrice, gasLimit, to, value, data, v, r, s])";
}

function transactionFieldRows(parsed: ethers.Transaction): StructureRow[] {
  if (parsed.type === 2) {
    return [
      ["[0] chainId", parsed.chainId.toString()],
      ["[1] nonce", parsed.nonce.toString()],
      ["[2] maxPriorityFeePerGas", parsed.maxPriorityFeePerGas?.toString() || "null"],
      ["[3] maxFeePerGas", parsed.maxFeePerGas?.toString() || "null"],
      ["[4] gasLimit", parsed.gasLimit.toString()],
      ["[5] to", parsed.to || "Contract creation"],
      ["[6] value", `${parsed.value.toString()} wei (${ethers.formatEther(parsed.value)} ETH)`],
      ["[7] data", parsed.data || "0x"],
      ["[8] accessList", formatAccessList(parsed.accessList || null)],
      ["[9] yParity", parsed.signature?.yParity.toString() || "null"],
      ["[10] r", parsed.signature?.r || "null"],
      ["[11] s", parsed.signature?.s || "null"]
    ];
  }

  return [
    ["nonce", parsed.nonce.toString()],
    ["gasPrice", parsed.gasPrice?.toString() || "null"],
    ["gasLimit", parsed.gasLimit.toString()],
    ["to", parsed.to || "Contract creation"],
    ["value", `${parsed.value.toString()} wei (${ethers.formatEther(parsed.value)} ETH)`],
    ["data", parsed.data || "0x"],
    ["v", parsed.signature?.v.toString() || "null"],
    ["r", parsed.signature?.r || "null"],
    ["s", parsed.signature?.s || "null"]
  ];
}

function buildLoginMessage(address: string) {
  return [
    "EOA Wallet Lab login request",
    `Address: ${address}`,
    `Origin: ${globalThis.location?.origin || "local"}`,
    `Nonce: ${makeNonce()}`,
    `Issued At: ${new Date().toISOString()}`
  ].join("\n");
}

function getStoredVaultAddress() {
  const json = localStorage.getItem(VAULT_KEY);
  if (!json) return "";
  try {
    const parsed = JSON.parse(json) as { address?: string };
    return parsed.address || "";
  } catch {
    return "";
  }
}

function App() {
  const [wallet, setWallet] = useState<EoaWallet | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [importKey, setImportKey] = useState("");
  const [seedPhrase, setSeedPhrase] = useState("");
  const [vaultPassword, setVaultPassword] = useState("");
  const [vaultAddress, setVaultAddress] = useState(getStoredVaultAddress);
  const [activeTab, setActiveTab] = useState<TabId>("sign");

  const [message, setMessage] = useState("Create or import a wallet, then generate a request.");
  const [signature, setSignature] = useState("");
  const [recoveredAddress, setRecoveredAddress] = useState("");

  const [typedStatement, setTypedStatement] = useState("Authorize this browser session.");
  const [typedNonce, setTypedNonce] = useState(makeNonce());
  const [typedDeadline, setTypedDeadline] = useState(() =>
    Math.floor(Date.now() / 1000 + 30 * 60).toString()
  );
  const [typedChainId, setTypedChainId] = useState("31337");
  const [typedVerifier, setTypedVerifier] = useState(ZERO_ADDRESS);
  const [typedSignature, setTypedSignature] = useState("");
  const [typedRecovered, setTypedRecovered] = useState("");

  const [rpcUrl, setRpcUrl] = useState(defaultRpcUrl);
  const [rpcStatus, setRpcStatus] = useState("Not checked");
  const [rpcBalance, setRpcBalance] = useState("");
  const [rpcNonce, setRpcNonce] = useState("");
  const [rpcBlock, setRpcBlock] = useState("");

  const [txTo, setTxTo] = useState("");
  const [txValue, setTxValue] = useState("0");
  const [txData, setTxData] = useState("0x");
  const [txChainId, setTxChainId] = useState("31337");
  const [txNonce, setTxNonce] = useState("0");
  const [txGasLimit, setTxGasLimit] = useState("21000");
  const [txMaxFee, setTxMaxFee] = useState("1");
  const [txPriorityFee, setTxPriorityFee] = useState("1");
  const [rawTx, setRawTx] = useState("");
  const [txHash, setTxHash] = useState("");
  const [txSigner, setTxSigner] = useState("");
  const [broadcastHash, setBroadcastHash] = useState("");
  const [txExecutionStatus, setTxExecutionStatus] = useState("Not broadcast");
  const [txReceiptBlock, setTxReceiptBlock] = useState("");
  const [txReceiptGasUsed, setTxReceiptGasUsed] = useState("");
  const [txConfirmations, setTxConfirmations] = useState("");
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  const [activity, setActivity] = useState<Activity[]>([
    {
      id: 1,
      tone: "info",
      text: "Wallet lab ready. Private keys stay in this browser session.",
      time: new Date().toLocaleTimeString()
    }
  ]);
  const [messageStructure, setMessageStructure] = useState<RecoveredStructure | null>(null);
  const [typedStructure, setTypedStructure] = useState<RecoveredStructure | null>(null);
  const [txStructure, setTxStructure] = useState<RecoveredStructure | null>(null);

  const messageVerified =
    Boolean(wallet?.address && recoveredAddress) &&
    recoveredAddress.toLowerCase() === wallet!.address.toLowerCase();
  const typedVerified =
    Boolean(wallet?.address && typedRecovered) && typedRecovered.toLowerCase() === wallet!.address.toLowerCase();
  const txVerified =
    Boolean(wallet?.address && txSigner) && txSigner.toLowerCase() === wallet!.address.toLowerCase();

  const typedDomain = useMemo(
    () => ({
      name: "EOA Wallet Lab",
      version: "1",
      chainId: BigInt(typedChainId || "1"),
      verifyingContract: typedVerifier || ZERO_ADDRESS
    }),
    [typedChainId, typedVerifier]
  );

  const typedTypes = useMemo(
    () => ({
      LoginRequest: [
        { name: "owner", type: "address" },
        { name: "statement", type: "string" },
        { name: "nonce", type: "string" },
        { name: "deadline", type: "uint256" }
      ]
    }),
    []
  );

  const typedValue = useMemo(
    () => ({
      owner: wallet?.address || ZERO_ADDRESS,
      statement: typedStatement,
      nonce: typedNonce,
      deadline: BigInt(typedDeadline || "0")
    }),
    [wallet?.address, typedStatement, typedNonce, typedDeadline]
  );

  function addActivity(tone: Activity["tone"], text: string) {
    setActivity((items) => [
      {
        id: Date.now(),
        tone,
        text,
        time: new Date().toLocaleTimeString()
      },
      ...items.slice(0, 9)
    ]);
  }

  function requireWallet() {
    if (!wallet) throw new Error("Create, import, or unlock a wallet first.");
    return wallet;
  }

  async function withErrorBoundary(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      addActivity("error", errorMessage(error));
    }
  }

  function resetBroadcastState() {
    setBroadcastHash("");
    setTxExecutionStatus("Not broadcast");
    setTxReceiptBlock("");
    setTxReceiptGasUsed("");
    setTxConfirmations("");
  }

  function buildMessageStructure(
    title: string,
    recovered: string,
    nextSignature: string,
    digest: string,
    expectedAddress: string | undefined
  ): RecoveredStructure {
    return {
      title,
      tone: verificationStatus(expectedAddress, recovered).startsWith("matched") ? "ok" : "warn",
      rows: [
        ["Recovered address", recovered],
        ["Expected wallet", expectedAddress || "No wallet"],
        ["Result", verificationStatus(expectedAddress, recovered)],
        ["EIP-191 digest", digest]
      ],
      blocks: [
        {
          title: "EIP-191 signed payload",
          rows: [
            ["Canonical envelope", personalSignEnvelope(message)],
            ["Message byte length", ethers.toUtf8Bytes(message).length.toString()]
          ]
        },
        {
          title: "Message",
          code: message
        },
        {
          title: "Signature",
          rows: [["signature", nextSignature]]
        }
      ]
    };
  }

  function buildTypedStructure(
    title: string,
    recovered: string,
    nextSignature: string,
    digest: string,
    expectedAddress: string | undefined
  ): RecoveredStructure {
    return {
      title,
      tone: verificationStatus(expectedAddress, recovered).startsWith("matched") ? "ok" : "warn",
      rows: [
        ["Recovered address", recovered],
        ["Expected wallet", expectedAddress || "No wallet"],
        ["Result", verificationStatus(expectedAddress, recovered)],
        ["EIP-712 digest", digest],
        ["Statement", typedStatement]
      ],
      blocks: [
        {
          title: "Domain",
          code: jsonWithBigInt(typedDomain)
        },
        {
          title: "Types",
          code: jsonWithBigInt(typedTypes)
        },
        {
          title: "Message",
          code: jsonWithBigInt(typedValue)
        },
        {
          title: "Signature",
          rows: [["signature", nextSignature]]
        }
      ]
    };
  }

  function buildTxStructure(
    title: string,
    parsed: ethers.Transaction,
    signed: string,
    expectedAddress: string | undefined,
    extraBlocks: StructureBlock[] = []
  ): RecoveredStructure {
    return {
      title,
      tone: verificationStatus(expectedAddress, parsed.from || null).startsWith("matched") ? "ok" : "warn",
      rows: [
        ["Recovered signer", parsed.from || "No signer"],
        ["Expected wallet", expectedAddress || "No wallet"],
        ["Result", verificationStatus(expectedAddress, parsed.from || null)],
        ["Tx hash", parsed.hash || "No hash"],
        ["Transaction type", `${parsed.type} (${parsed.typeName || "legacy"})`]
      ],
      blocks: [
        {
          title: "Serialized transaction",
          code: signed
        },
        {
          title: "Typed transaction envelope",
          code: transactionEnvelopeExpression(parsed)
        },
        {
          title: "Decoded RLP fields",
          rows: transactionFieldRows(parsed)
        },
        {
          title: "Recovered signature",
          rows: [
            ["from", parsed.from || "No signer"],
            ["yParity", parsed.signature?.yParity.toString() || "null"],
            ["v", parsed.signature?.v.toString() || "null"],
            ["r", parsed.signature?.r || "null"],
            ["s", parsed.signature?.s || "null"]
          ]
        },
        ...extraBlocks
      ]
    };
  }

  async function copyText(value: string, label: string) {
    if (!value) return;
    await withErrorBoundary(async () => {
      await navigator.clipboard.writeText(value);
      addActivity("ok", `${label} copied.`);
    });
  }

  function selectWallet(nextWallet: EoaWallet, source: string) {
    setWallet(nextWallet);
    setShowPrivateKey(false);
    setMessage(buildLoginMessage(nextWallet.address));
    setTxTo(nextWallet.address);
    setRecoveredAddress("");
    setTypedRecovered("");
    setTxSigner("");
    setRawTx("");
    setTxHash("");
    resetBroadcastState();
    setMessageStructure(null);
    setTypedStructure(null);
    setTxStructure(null);
    addActivity("ok", `${source}: ${nextWallet.address}`);
  }

  function createWallet() {
    const nextWallet = ethers.Wallet.createRandom();
    selectWallet(nextWallet, "Created wallet");
  }

  function importWallet() {
    withErrorBoundary(async () => {
      const nextWallet = new ethers.Wallet(importKey.trim());
      setImportKey("");
      selectWallet(nextWallet, "Imported wallet");
    });
  }

  function importSeedPhrase() {
    withErrorBoundary(async () => {
      const phrase = seedPhrase.trim().replace(/\s+/g, " ");
      if (!phrase) throw new Error("Enter a seed phrase to import.");
      const nextWallet = ethers.HDNodeWallet.fromPhrase(phrase, "", DEFAULT_DERIVATION_PATH);
      setSeedPhrase("");
      selectWallet(nextWallet, `Imported seed phrase at ${DEFAULT_DERIVATION_PATH}`);
    });
  }

  function lockWallet() {
    setWallet(null);
    setShowPrivateKey(false);
    setSignature("");
    setRecoveredAddress("");
    setTypedSignature("");
    setTypedRecovered("");
    setRawTx("");
    setTxHash("");
    setTxSigner("");
    resetBroadcastState();
    setMessageStructure(null);
    setTypedStructure(null);
    setTxStructure(null);
    addActivity("info", "Wallet locked in browser state.");
  }

  function saveVault() {
    withErrorBoundary(async () => {
      const activeWallet = requireWallet();
      if (vaultPassword.length < 8) throw new Error("Use at least 8 characters for the vault password.");
      const encryptedJson = await activeWallet.encrypt(vaultPassword);
      localStorage.setItem(VAULT_KEY, encryptedJson);
      setVaultAddress(activeWallet.address);
      addActivity("ok", "Encrypted vault saved to localStorage.");
    });
  }

  function unlockVault() {
    withErrorBoundary(async () => {
      const encryptedJson = localStorage.getItem(VAULT_KEY);
      if (!encryptedJson) throw new Error("No encrypted vault found in localStorage.");
      const restored = (await ethers.Wallet.fromEncryptedJson(encryptedJson, vaultPassword)) as EoaWallet;
      selectWallet(restored, "Unlocked vault");
    });
  }

  function clearVault() {
    localStorage.removeItem(VAULT_KEY);
    setVaultAddress("");
    addActivity("warn", "Encrypted vault removed from localStorage.");
  }

  function generateRequest() {
    withErrorBoundary(async () => {
      const activeWallet = requireWallet();
      setMessage(buildLoginMessage(activeWallet.address));
      setSignature("");
      setRecoveredAddress("");
      setMessageStructure(null);
      addActivity("info", "New EIP-191 request generated.");
    });
  }

  function signMessage() {
    withErrorBoundary(async () => {
      const activeWallet = requireWallet();
      const nextSignature = await activeWallet.signMessage(message);
      setSignature(nextSignature);
      setRecoveredAddress("");
      setMessageStructure(null);
      addActivity("ok", "EIP-191 signed. Click Verify to recover the signer.");
    });
  }

  function verifyMessage() {
    withErrorBoundary(async () => {
      if (!signature) throw new Error("No signature to verify.");
      const recovered = ethers.verifyMessage(message, signature);
      const digest = ethers.hashMessage(message);
      setRecoveredAddress(recovered);
      setMessageStructure(buildMessageStructure("EIP-191 recovered structure", recovered, signature, digest, wallet?.address));
      addActivity("ok", "EIP-191 verify recovered signer.");
    });
  }

  function signTypedData() {
    withErrorBoundary(async () => {
      const activeWallet = requireWallet();
      if (!ethers.isAddress(typedVerifier)) throw new Error("Verifier must be a valid address.");
      const nextSignature = await activeWallet.signTypedData(typedDomain, typedTypes, typedValue);
      setTypedSignature(nextSignature);
      setTypedRecovered("");
      setTypedStructure(null);
      addActivity("ok", "EIP-712 signed. Click Verify to recover the signer.");
    });
  }

  function verifyTypedData() {
    withErrorBoundary(async () => {
      if (!typedSignature) throw new Error("No EIP-712 signature to verify.");
      const recovered = ethers.verifyTypedData(typedDomain, typedTypes, typedValue, typedSignature);
      const digest = ethers.TypedDataEncoder.hash(typedDomain, typedTypes, typedValue);
      setTypedRecovered(recovered);
      setTypedStructure(buildTypedStructure("EIP-712 recovered structure", recovered, typedSignature, digest, wallet?.address));
      addActivity("ok", "EIP-712 verify recovered signer.");
    });
  }

  function buildTxRequest(): ethers.TransactionRequest {
    const activeWallet = requireWallet();
    const to = txTo.trim() || activeWallet.address;
    const data = txData.trim() || "0x";
    if (!ethers.isAddress(to)) throw new Error("Recipient must be a valid EVM address.");
    if (!ethers.isHexString(data)) throw new Error("Data must be 0x-prefixed hex.");

    return {
      type: 2,
      to,
      value: ethers.parseEther(txValue || "0"),
      data,
      chainId: BigInt(txChainId || "1"),
      nonce: Number(txNonce || "0"),
      gasLimit: BigInt(txGasLimit || "21000"),
      maxFeePerGas: ethers.parseUnits(txMaxFee || "1", "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits(txPriorityFee || "1", "gwei")
    };
  }

  function signTransaction() {
    withErrorBoundary(async () => {
      const activeWallet = requireWallet();
      const signed = await activeWallet.signTransaction(buildTxRequest());
      const parsed = ethers.Transaction.from(signed);
      setRawTx(signed);
      setTxHash(parsed.hash || "");
      setTxSigner("");
      resetBroadcastState();
      setTxStructure(null);
      addActivity("ok", "Transaction signed locally. Click Recover signer from raw tx to decode it.");
    });
  }

  async function recordTransactionReceipt(
    receipt: ethers.TransactionReceipt,
    parsed: ethers.Transaction,
    signed: string,
    expectedAddress: string | undefined,
    broadcastHashValue: string
  ) {
    const confirmations = await receipt.confirmations();
    const status = receiptStatusLabel(receipt.status);
    const tone = receipt.status === 1 ? "ok" : "warn";

    setTxExecutionStatus(status);
    setTxReceiptBlock(receipt.blockNumber.toString());
    setTxReceiptGasUsed(receipt.gasUsed.toString());
    setTxConfirmations(confirmations.toString());
    setTxStructure(
      buildTxStructure("Transaction decoded structure", parsed, signed, expectedAddress, [
        {
          title: "Broadcast receipt",
          rows: [
            ["Broadcast hash", broadcastHashValue],
            ["Status", status],
            ["Block", receipt.blockNumber.toString()],
            ["Confirmations", confirmations.toString()],
            ["Gas used", receipt.gasUsed.toString()],
            ["Cumulative gas used", receipt.cumulativeGasUsed.toString()]
          ]
        }
      ])
    );
    addActivity(tone, `Transaction ${status.toLowerCase()} in block ${receipt.blockNumber}.`);
  }

  function verifyRawTransaction() {
    withErrorBoundary(async () => {
      if (!rawTx) throw new Error("No raw transaction to verify.");
      const parsed = ethers.Transaction.from(rawTx);
      setTxHash(parsed.hash || "");
      setTxSigner(parsed.from || "");
      setTxStructure(buildTxStructure("Transaction decoded structure", parsed, rawTx, wallet?.address));
      addActivity("ok", "Raw transaction verify recovered signer.");
    });
  }

  function populateTransactionFromRpc() {
    withErrorBoundary(async () => {
      const activeWallet = requireWallet();
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const connected = activeWallet.connect(provider);
      const base = {
        to: txTo.trim() || activeWallet.address,
        value: ethers.parseEther(txValue || "0"),
        data: txData.trim() || "0x"
      };
      const network = await provider.getNetwork();
      const feeData = await provider.getFeeData();
      const gasLimit = await provider.estimateGas({ ...base, from: activeWallet.address });
      const nonce = await provider.getTransactionCount(activeWallet.address, "pending");
      const populated = await connected.populateTransaction(base);

      setTxChainId((populated.chainId || network.chainId).toString());
      setTxNonce(nonce.toString());
      setTxGasLimit((populated.gasLimit || gasLimit).toString());
      if (feeData.maxFeePerGas) setTxMaxFee(ethers.formatUnits(feeData.maxFeePerGas, "gwei"));
      if (feeData.maxPriorityFeePerGas) {
        setTxPriorityFee(ethers.formatUnits(feeData.maxPriorityFeePerGas, "gwei"));
      }
      addActivity("ok", `Transaction fields populated from chain ${network.chainId.toString()}.`);
    });
  }

  function broadcastTransaction() {
    withErrorBoundary(async () => {
      if (isBroadcasting) return;
      setIsBroadcasting(true);
      let signed = "";
      try {
        signed = rawTx || (await requireWallet().signTransaction(buildTxRequest()));
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const parsed = ethers.Transaction.from(signed);
        const response = await provider.broadcastTransaction(signed);
        setRawTx(signed);
        setTxHash(parsed.hash || response.hash);
        setTxSigner(parsed.from || "");
        setBroadcastHash(response.hash);
        setTxExecutionStatus("Submitted; waiting for receipt");
        setTxReceiptBlock("");
        setTxReceiptGasUsed("");
        setTxConfirmations("0");
        setTxStructure(
          buildTxStructure("Transaction decoded structure", parsed, signed, wallet?.address, [
            {
              title: "Broadcast tracking",
              rows: [
                ["Broadcast hash", response.hash],
                ["Execution", "Submitted; waiting for receipt"],
                ["RPC URL", rpcUrl]
              ]
            }
          ])
        );
        addActivity("warn", `Broadcast submitted: ${response.hash}`);

        const receipt = await provider.waitForTransaction(response.hash, 1, 60_000);
        if (!receipt) {
          setTxExecutionStatus("Submitted; receipt not found yet");
          setTxStructure(
            buildTxStructure("Transaction decoded structure", parsed, signed, wallet?.address, [
              {
                title: "Broadcast tracking",
                rows: [
                  ["Broadcast hash", response.hash],
                  ["Execution", "Submitted; receipt not found yet"],
                  ["Timeout", "60 seconds"],
                  ["Next step", "Click Check RPC or wait for the chain to mine the transaction"]
                ]
              }
            ])
          );
          addActivity("warn", "Broadcast submitted; receipt not found within 60s.");
          return;
        }

        await recordTransactionReceipt(receipt, parsed, signed, wallet?.address, response.hash);
      } catch (error) {
        setTxExecutionStatus("Broadcast or receipt listener failed");
        if (signed) {
          const parsed = ethers.Transaction.from(signed);
          setTxStructure(
            buildTxStructure("Transaction decoded structure", parsed, signed, wallet?.address, [
              {
                title: "Broadcast error",
                rows: [
                  ["Error", errorMessage(error)],
                  ["RPC URL", rpcUrl]
                ]
              }
            ])
          );
        }
        throw error;
      } finally {
        setIsBroadcasting(false);
      }
    });
  }

  function checkRpc() {
    withErrorBoundary(async () => {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const network = await provider.getNetwork();
      const blockNumber = await provider.getBlockNumber();
      setRpcBlock(blockNumber.toString());
      setRpcStatus(`Connected to chain ${network.chainId.toString()}`);
      setTxChainId(network.chainId.toString());
      setTypedChainId(network.chainId.toString());
      if (wallet) {
        const [balance, nonce] = await Promise.all([
          provider.getBalance(wallet.address),
          provider.getTransactionCount(wallet.address, "pending")
        ]);
        setRpcBalance(`${ethers.formatEther(balance)} ETH`);
        setRpcNonce(nonce.toString());
        setTxNonce(nonce.toString());
      }
      addActivity("ok", `RPC connected at block ${blockNumber}.`);
    });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>EOA Wallet Lab</h1>
          <p>Minimal secp256k1 wallet flows for creation, proof, and transaction signing.</p>
        </div>
        <div className="topbar-status">
          <StatusDot tone={wallet ? "ok" : "warn"} label={wallet ? shortAddress(wallet.address) : "Locked"} />
          <button className="ghost-button" onClick={checkRpc}>
            <Radio size={16} />
            Check RPC
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <section className="panel wallet-panel">
            <SectionHeader icon={WalletCards} title="Wallet" />
            <div className="wallet-address">
              <span>Address</span>
              <strong>{wallet ? wallet.address : "Create or import an EOA"}</strong>
            </div>
            <div className="button-grid">
              <button className="primary-button" onClick={createWallet}>
                <KeyRound size={16} />
                Create
              </button>
              <button className="secondary-button" onClick={lockWallet} disabled={!wallet}>
                <Lock size={16} />
                Lock
              </button>
            </div>

            <Field label="Import private key">
              <input
                value={importKey}
                onChange={(event) => setImportKey(event.target.value)}
                placeholder="0x..."
                spellCheck={false}
              />
            </Field>
            <button className="secondary-button full-width" onClick={importWallet} disabled={!importKey.trim()}>
              <Unlock size={16} />
              Import private key
            </button>

            <Field label="Import seed phrase">
              <textarea
                value={seedPhrase}
                onChange={(event) => setSeedPhrase(event.target.value)}
                placeholder="twelve or twenty four words"
                spellCheck={false}
              />
            </Field>
            <p className="hint">
              Seed phrase import automatically uses account path {DEFAULT_DERIVATION_PATH}.
            </p>
            <button className="secondary-button full-width" onClick={importSeedPhrase} disabled={!seedPhrase.trim()}>
              <Unlock size={16} />
              Import seed
            </button>

            <div className="divider" />

            <Field label="Private key">
              <div className="inline-field">
                <input
                  value={wallet ? (showPrivateKey ? wallet.privateKey : "0x" + "*".repeat(64)) : ""}
                  readOnly
                  spellCheck={false}
                />
                <button className="icon-button" onClick={() => setShowPrivateKey((value) => !value)} disabled={!wallet}>
                  {showPrivateKey ? <Lock size={16} /> : <Unlock size={16} />}
                </button>
                <button
                  className="icon-button"
                  onClick={() => copyText(wallet?.privateKey || "", "Private key")}
                  disabled={!wallet}
                >
                  <Copy size={16} />
                </button>
              </div>
            </Field>

            <Field label="Mnemonic">
              <textarea value={mnemonicPhrase(wallet)} readOnly />
            </Field>
          </section>

          <section className="panel">
            <SectionHeader icon={ShieldCheck} title="Encrypted Vault" />
            <p className="hint">Demo vault uses ethers JSON keystore in localStorage. This is for local learning, not custody.</p>
            <Field label="Password">
              <input
                type="password"
                value={vaultPassword}
                onChange={(event) => setVaultPassword(event.target.value)}
                placeholder="8+ characters"
              />
            </Field>
            <div className="button-grid">
              <button className="secondary-button" onClick={saveVault} disabled={!wallet || vaultPassword.length < 8}>
                <Lock size={16} />
                Save
              </button>
              <button className="secondary-button" onClick={unlockVault} disabled={!vaultPassword}>
                <Unlock size={16} />
                Unlock
              </button>
            </div>
            <button className="text-button" onClick={clearVault} disabled={!vaultAddress}>
              Clear saved vault {vaultAddress ? `(${shortAddress(vaultAddress)})` : ""}
            </button>
          </section>
        </aside>

        <section className="main-panel">
          <nav className="tabs" aria-label="Wallet flows">
            <TabButton active={activeTab === "sign"} icon={FileSignature} label="Sign & Verify" onClick={() => setActiveTab("sign")} />
            <TabButton active={activeTab === "typed"} icon={ShieldCheck} label="EIP-712" onClick={() => setActiveTab("typed")} />
            <TabButton active={activeTab === "tx"} icon={Send} label="Transaction" onClick={() => setActiveTab("tx")} />
            <TabButton active={activeTab === "rpc"} icon={Network} label="RPC" onClick={() => setActiveTab("rpc")} />
          </nav>

          {activeTab === "sign" && (
            <section className="flow-grid">
              <div className="flow-card">
                <SectionHeader icon={FileSignature} title="EIP-191 Request" />
                <Field label="Message">
                  <textarea value={message} onChange={(event) => setMessage(event.target.value)} />
                </Field>
                <div className="button-row">
                  <button className="secondary-button" onClick={generateRequest}>
                    <RefreshCw size={16} />
                    New request
                  </button>
                  <button className="primary-button" onClick={signMessage} disabled={!wallet}>
                    <FileSignature size={16} />
                    Sign
                  </button>
                  <button className="secondary-button" onClick={verifyMessage} disabled={!signature}>
                    <ShieldCheck size={16} />
                    Verify
                  </button>
                </div>
              </div>
              <div className="result-stack">
                <ResultPanel
                  ok={messageVerified}
                  title="Verification"
                  lines={[
                    ["Expected", wallet?.address || "No wallet"],
                    ["Recovered", recoveredAddress || "Not verified"],
                    ["Signature", signature || "No signature"]
                  ]}
                />
                <RecoveredStructurePanel
                  structure={messageStructure}
                  emptyText="Sign or verify the request to show the EIP-191 message envelope and recovered signer."
                />
              </div>
            </section>
          )}

          {activeTab === "typed" && (
            <section className="flow-grid">
              <div className="flow-card">
                <SectionHeader icon={ShieldCheck} title="EIP-712 Typed Data" />
                <div className="two-column">
                  <Field label="Chain ID">
                    <input value={typedChainId} onChange={(event) => setTypedChainId(event.target.value)} />
                  </Field>
                  <Field label="Deadline">
                    <input value={typedDeadline} onChange={(event) => setTypedDeadline(event.target.value)} />
                  </Field>
                </div>
                <Field label="Verifying contract">
                  <input value={typedVerifier} onChange={(event) => setTypedVerifier(event.target.value)} spellCheck={false} />
                </Field>
                <Field label="Statement">
                  <input value={typedStatement} onChange={(event) => setTypedStatement(event.target.value)} />
                </Field>
                <Field label="Nonce">
                  <div className="inline-field">
                    <input value={typedNonce} onChange={(event) => setTypedNonce(event.target.value)} />
                    <button className="icon-button" onClick={() => setTypedNonce(makeNonce())}>
                      <RefreshCw size={16} />
                    </button>
                  </div>
                </Field>
                <pre className="json-preview">{jsonWithBigInt({ domain: typedDomain, types: typedTypes, value: typedValue })}</pre>
                <div className="button-row">
                  <button className="primary-button" onClick={signTypedData} disabled={!wallet}>
                    <FileSignature size={16} />
                    Sign typed data
                  </button>
                  <button className="secondary-button" onClick={verifyTypedData} disabled={!typedSignature}>
                    <ShieldCheck size={16} />
                    Verify
                  </button>
                </div>
              </div>
              <div className="result-stack">
                <ResultPanel
                  ok={typedVerified}
                  title="Typed Data Verification"
                  lines={[
                    ["Expected", wallet?.address || "No wallet"],
                    ["Recovered", typedRecovered || "Not verified"],
                    ["Signature", typedSignature || "No signature"]
                  ]}
                />
                <RecoveredStructurePanel
                  structure={typedStructure}
                  emptyText="Sign or verify typed data to show the EIP-712 domain, types, message, and recovered signer."
                />
              </div>
            </section>
          )}

          {activeTab === "tx" && (
            <section className="flow-grid">
              <div className="flow-card">
                <SectionHeader icon={Send} title="Transaction" />
                <p className="hint">Local signing spends no gas. Broadcasting sends the raw transaction to the RPC and may spend gas.</p>
                <Field label="Recipient">
                  <input value={txTo} onChange={(event) => setTxTo(event.target.value)} placeholder={wallet?.address || ZERO_ADDRESS} spellCheck={false} />
                </Field>
                <div className="two-column">
                  <Field label="Value ETH">
                    <input value={txValue} onChange={(event) => setTxValue(event.target.value)} />
                  </Field>
                  <Field label="Chain ID">
                    <input value={txChainId} onChange={(event) => setTxChainId(event.target.value)} />
                  </Field>
                </div>
                <Field label="Data">
                  <input value={txData} onChange={(event) => setTxData(event.target.value)} spellCheck={false} />
                </Field>
                <div className="three-column">
                  <Field label="Nonce">
                    <input value={txNonce} onChange={(event) => setTxNonce(event.target.value)} />
                  </Field>
                  <Field label="Gas limit">
                    <input value={txGasLimit} onChange={(event) => setTxGasLimit(event.target.value)} />
                  </Field>
                  <Field label="Max fee gwei">
                    <input value={txMaxFee} onChange={(event) => setTxMaxFee(event.target.value)} />
                  </Field>
                </div>
                <Field label="Priority fee gwei">
                  <input value={txPriorityFee} onChange={(event) => setTxPriorityFee(event.target.value)} />
                </Field>
                <div className="button-row">
                  <button className="secondary-button" onClick={populateTransactionFromRpc} disabled={!wallet}>
                    <RefreshCw size={16} />
                    Populate
                  </button>
                  <button className="primary-button" onClick={signTransaction} disabled={!wallet}>
                    <FileSignature size={16} />
                    Sign only
                  </button>
                  <button
                    className="secondary-button danger"
                    onClick={broadcastTransaction}
                    disabled={isBroadcasting || (!wallet && !rawTx)}
                  >
                    <Send size={16} />
                    {isBroadcasting ? "Broadcasting" : "Broadcast"}
                  </button>
                </div>
                <Field label="Raw signed transaction">
                  <textarea
                    value={rawTx}
                    onChange={(event) => {
                      setRawTx(event.target.value);
                      resetBroadcastState();
                      setTxStructure(null);
                    }}
                    spellCheck={false}
                  />
                </Field>
                <button className="secondary-button" onClick={verifyRawTransaction} disabled={!rawTx}>
                  <ShieldCheck size={16} />
                  Recover signer from raw tx
                </button>
              </div>
              <div className="result-stack">
                <ResultPanel
                  ok={txVerified}
                  title="Transaction Result"
                  lines={[
                    ["Signer", txSigner || "Not recovered"],
                    ["Tx hash", txHash || "Not signed"],
                    ["Broadcast", broadcastHash || "Not broadcast"],
                    ["Execution", txExecutionStatus],
                    ["Block", txReceiptBlock || "Not included"],
                    ["Confirmations", txConfirmations || "0"],
                    ["Gas used", txReceiptGasUsed || "Unknown"]
                  ]}
                />
                <RecoveredStructurePanel
                  structure={txStructure}
                  emptyText="Sign, recover, or broadcast to decode the raw transaction as type byte plus RLP fields."
                />
              </div>
            </section>
          )}

          {activeTab === "rpc" && (
            <section className="flow-grid">
              <div className="flow-card">
                <SectionHeader icon={Network} title="RPC Request" />
                <Field label="RPC URL">
                  <input value={rpcUrl} onChange={(event) => setRpcUrl(event.target.value)} spellCheck={false} />
                </Field>
                <button className="primary-button" onClick={checkRpc}>
                  <Radio size={16} />
                  Call eth_chainId / eth_blockNumber
                </button>
                <p className="hint">Default points to the same host on port 8545, useful for Anvil or Hardhat on devNuc.</p>
              </div>
              <ResultPanel
                ok={rpcStatus.startsWith("Connected")}
                title="RPC Status"
                lines={[
                  ["Status", rpcStatus],
                  ["Block", rpcBlock || "Unknown"],
                  ["Wallet balance", rpcBalance || "Unknown"],
                  ["Wallet nonce", rpcNonce || "Unknown"]
                ]}
              />
            </section>
          )}
        </section>

        <aside className="activity-panel panel">
          <SectionHeader icon={AlertCircle} title="Activity" />
          <div className="activity-list">
            {activity.map((item) => (
              <div className={`activity-item ${item.tone}`} key={item.id}>
                <span>{item.time}</span>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="section-header">
      <Icon size={18} />
      <h2>{title}</h2>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function TabButton({
  active,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={`tab-button ${active ? "active" : ""}`} onClick={onClick}>
      <Icon size={16} />
      {label}
    </button>
  );
}

function StatusDot({ tone, label }: { tone: "ok" | "warn"; label: string }) {
  return (
    <div className={`status-dot ${tone}`}>
      <span />
      {label}
    </div>
  );
}

function ResultPanel({
  ok,
  title,
  lines
}: {
  ok: boolean;
  title: string;
  lines: Array<[string, string]>;
}) {
  return (
    <div className={`result-panel ${ok ? "ok" : "pending"}`}>
      <div className="result-title">
        {ok ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
        <h2>{title}</h2>
      </div>
      <dl>
        {lines.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function RecoveredStructurePanel({ structure, emptyText }: { structure: RecoveredStructure | null; emptyText: string }) {
  return (
    <div className={`structure-panel ${structure?.tone || "pending"}`}>
      <SectionHeader icon={AlertCircle} title={structure?.title || "Recovered Structure"} />
      {!structure ? (
        <p className="structure-empty">{emptyText}</p>
      ) : (
        <div className="structure-content">
          <dl className="structure-summary">
            {structure.rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {structure.blocks.map((block) => (
            <section className="structure-block" key={block.title}>
              <h3>{block.title}</h3>
              {block.code && <pre>{block.code}</pre>}
              {block.rows && (
                <dl className="structure-details">
                  {block.rows.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
