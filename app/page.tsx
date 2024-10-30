"use client";

import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
  KernelAccountClient,
} from "@zerodev/sdk";
import {
  toPasskeyValidator,
  toWebAuthnKey,
  WebAuthnMode,
  PasskeyValidatorContractVersion,
} from "@zerodev/passkey-validator";
import { KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { bundlerActions, ENTRYPOINT_ADDRESS_V07 } from "permissionless";
import React, { useEffect, useState } from "react";
import { createPublicClient, http, parseAbi, encodeFunctionData } from "viem";
import { bsc } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";

// @dev add your BUNDLER_URL, PAYMASTER_URL, and PASSKEY_SERVER_URL here
const BUNDLER_RPC = `https://rpc.zerodev.app/api/v2/bundler/${process.env.projectId}`;
const PAYMASTER_RPC = `https://rpc.zerodev.app/api/v2/paymaster/${process.env.projectId}`;
const PRIVATE_KEY = `0x${process.env.privateKey}`;

// The NFT contract we will be interacting with
const contractAddress = "0x55d398326f99059fF775485246999027B3197955";
const contractABI = parseAbi([
  "function balanceOf(address account) external view returns (uint256)",
  "function transfer(address recipient, uint256 amount) external returns (bool)",
  "function approve(address spender, uint256 amount) external returns (bool)"
]);

const gravity = "0x9a0A02B296240D2620E339cCDE386Ff612f07Be5";
const gravityABI = parseAbi([
  "function sendToCosmos(address _tokenContract,string calldata _destination,uint256 _amount) external",
]);

// Construct a public client
const chain = bsc;
const publicClient = createPublicClient({
  transport: http(BUNDLER_RPC),
  chain,
});
const entryPoint = ENTRYPOINT_ADDRESS_V07;

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [accountAddress, setAccountAddress] = useState("");
  const [isKernelClientReady, setIsKernelClientReady] = useState(false);
  const [kernelClient, setKernelClient] = useState<KernelAccountClient<any>>();
  const [isSendingUserOp, setIsSendingUserOp] = useState(false);
  const [userOpHash, setUserOpHash] = useState("");
  const [userOpStatus, setUserOpStatus] = useState("");
  const [usdtBalance, setUsdtBalance] = useState(0n);
  const [bnbBalance, setBnbBalance] = useState(0n);

  const createAccountAndClient = async () => {
    console.log("constructing signer");
    const signer = privateKeyToAccount(PRIVATE_KEY as any);

    const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
      signer,
      entryPoint,
      kernelVersion: KERNEL_V3_1,
    });

    const account = await createKernelAccount(publicClient, {
      entryPoint,
      plugins: {
        sudo: ecdsaValidator,
      },
      kernelVersion: KERNEL_V3_1,
    });

    const kernelClient = createKernelAccountClient({
      account,
      chain,
      entryPoint,
      bundlerTransport: http(BUNDLER_RPC),
      middleware: {
        sponsorUserOperation: async ({ userOperation }) => {
          const zerodevPaymaster = createZeroDevPaymasterClient({
            chain,
            entryPoint,
            transport: http(PAYMASTER_RPC),
          });
          return zerodevPaymaster.sponsorUserOperation({
            userOperation,
            entryPoint,
          });
        },
      },
    });
    setKernelClient(kernelClient as any);

    const accountAddress = kernelClient.account.address;

    const bnbBalance = await publicClient.getBalance({
      address: accountAddress,
    });
    setBnbBalance(bnbBalance);
    console.log("BNB Balance: ", bnbBalance);

    const usdtBalance = await publicClient.readContract({
      address: contractAddress,
      abi: contractABI,
      functionName: "balanceOf",
      args: [accountAddress],
    });
    setUsdtBalance(usdtBalance);
    console.log("USDT Balance: ", usdtBalance);

    setAccountAddress(accountAddress);
    setIsKernelClientReady(true);
  };

  // Function to be called when "Login" is clicked
  const handleSendUserOp = async () => {
    setIsSendingUserOp(true);
    setUserOpStatus("Sending UserOp...");

    // add code here...
    const userOpHashApprove = await (kernelClient as any).sendUserOperation({
      userOperation: {
        callData: await (kernelClient as any).account.encodeCallData({
          to: contractAddress,
          value: BigInt(0),
          data: encodeFunctionData({
            abi: contractABI,
            functionName: "approve",
            args: [gravity as any, 10n ** 18n],
          }),
        }),
      },
    });

    setUserOpHash(userOpHashApprove);

    // add code here...
    const bundlerClient = (kernelClient as any).extend(
      bundlerActions(entryPoint)
    );

    await bundlerClient.waitForUserOperationReceipt({
      hash: userOpHashApprove,
      timeout: 1000 * 50,
    });

    // Update the message based on the count of UserOps
    const userOpHashBridge = await (kernelClient as any).sendUserOperation({
        userOperation: {
          callData: await (kernelClient as any).account.encodeCallData({
            to: gravity,
            value: BigInt(0),
            data: encodeFunctionData({
              abi: gravityABI,
              functionName: "sendToCosmos",
              args: [contractAddress, `channel-1/${recipient}`, 10n ** 18n],
            }),
          }),
        },
      });

    setUserOpHash(userOpHashBridge);

    // add code here...
    await bundlerClient.waitForUserOperationReceipt({
      hash: userOpHashBridge,
      timeout: 1000 * 50,
    });

    const userOpMessage2 = `userOpHashBridge completed. <a href="https://jiffyscan.xyz/userOpHash/${userOpHashBridge}?network=mumbai" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-700">Click here to view.</a>`;

    setUserOpStatus(userOpMessage2);
    setIsSendingUserOp(false);
  };

  useEffect(() => {
    setMounted(true);
    createAccountAndClient();
  }, []);

  if (!mounted) return <></>;

  // Spinner component for visual feedback during loading states
  const Spinner = () => (
    <svg
      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );

  return (
    <main className="flex items-center justify-center min-h-screen px-4 py-24">
      <div className="w-full max-w-lg mx-auto">
        <h1 className="text-4xl font-semibold text-center mb-12">
          EVM Granting Demo
        </h1>

        <div className="space-y-4">
          {/* Account Address Label */}
          {accountAddress && (
            <div className="text-center mb-4">
              Account address:{" "}
              <a
                href={`https://jiffyscan.xyz/account/${accountAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-700"
              >
                {" "}
                {accountAddress}{" "}
              </a>
            </div>
          )}

          <div className="text-center mb-4">
            Usdt balance: {usdtBalance.toString()}
          </div>

          <div className="text-center mb-4">
            Bnb balance: {bnbBalance.toString()}
          </div>

          {/* Input Box */}
          <input
            type="text"
            placeholder="Recipient"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="p-2 text-black border border-gray-300 rounded-lg w-full"
          />

          {/* Send UserOp Button */}
          <div className="flex flex-col items-center w-full">
            <button
              onClick={handleSendUserOp}
              disabled={!isKernelClientReady || isSendingUserOp}
              className={`px-4 py-2 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-opacity-50 flex justify-center items-center w-full ${
                isKernelClientReady && !isSendingUserOp
                  ? "bg-green-500 hover:bg-green-700 focus:ring-green-500"
                  : "bg-gray-500"
              }`}
            >
              {isSendingUserOp ? <Spinner /> : "Send UserOp"}
            </button>
            {/* UserOp Status Label */}
            {userOpHash && (
              <div
                className="mt-4"
                dangerouslySetInnerHTML={{
                  __html: userOpStatus,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
