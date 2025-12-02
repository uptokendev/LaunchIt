import { BrowserProvider, JsonRpcSigner } from "ethers";
import { useCallback, useEffect, useMemo, useState } from "react";

type WalletHook = {
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  account: string;
  chainId?: number;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  isConnected: boolean;
};

export function useWallet(): WalletHook {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState<number>();
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
  const anyWindow = window as any;
  const eth = anyWindow.ethereum;
  if (!eth) {
    return;
  }

  // Prefer MetaMask Flask > MetaMask > first provider
  let selectedProvider = eth;

  if (Array.isArray(eth.providers) && eth.providers.length > 0) {
    selectedProvider =
      eth.providers.find((p: any) => p.isMetaMask && p.isFlask) ??
      eth.providers.find((p: any) => p.isMetaMask) ??
      eth.providers[0];
  }

  const browserProvider = new BrowserProvider(selectedProvider);
  setProvider(browserProvider);

  const handleAccountsChanged = (accounts: string[]) => {
    const primary = accounts[0] ?? "";
    setAccount(primary);
    if (primary) {
      browserProvider.getSigner().then(setSigner).catch(() => setSigner(null));
    } else {
      setSigner(null);
    }
  };

  const handleChainChanged = (hexChainId: string) => {
    try {
      setChainId(Number(BigInt(hexChainId)));
    } catch {
      setChainId(undefined);
    }
  };

  browserProvider
    .send("eth_accounts", [])
    .then(handleAccountsChanged)
    .catch(() => undefined);

  browserProvider
    .getNetwork()
    .then((network) => setChainId(Number(network.chainId)))
    .catch(() => undefined);

  eth?.on?.("accountsChanged", handleAccountsChanged);
  eth?.on?.("chainChanged", handleChainChanged);

  return () => {
    eth?.removeListener?.("accountsChanged", handleAccountsChanged);
    eth?.removeListener?.("chainChanged", handleChainChanged);
  };
}, []);

  const connect = useCallback(async () => {
    if (!provider) {
      throw new Error("No wallet available");
    }
    setConnecting(true);
    try {
      const accounts: string[] = await provider.send("eth_requestAccounts", []);
      if (accounts.length === 0) {
        throw new Error("No accounts returned");
      }
      const signerInstance = await provider.getSigner();
      setSigner(signerInstance);
      setAccount(accounts[0]);
      const network = await provider.getNetwork();
      setChainId(Number(network.chainId));
    } finally {
      setConnecting(false);
    }
  }, [provider]);

  const disconnect = useCallback(() => {
    setAccount("");
    setSigner(null);
    setChainId(undefined);
  }, []);

  return useMemo(
    () => ({
      provider,
      signer,
      account,
      chainId,
      connecting,
      connect,
      disconnect,                   // ⬅️ include it here
      isConnected: Boolean(account),
    }),
    [provider, signer, account, chainId, connecting, connect, disconnect]
  );
}
