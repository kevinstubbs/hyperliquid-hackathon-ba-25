'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { useState, useEffect } from 'react';
import { VAULT_ADDRESS, VAULT_ABI, USDC_ADDRESS, ERC20_ABI } from '@/lib/contracts';

export default function Home() {
  const { address, isConnected } = useAccount();
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawShares, setWithdrawShares] = useState('');

  // Read user position
  const { data: position, refetch: refetchPosition } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'getUserPosition',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Read vault stats
  const { data: vaultStats, refetch: refetchStats } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'getVaultStats',
  });

  // Write contracts
  const { writeContract: approve, data: approveHash } = useWriteContract();
  const { writeContract: deposit, data: depositHash } = useWriteContract();
  const { writeContract: withdraw, data: withdrawHash } = useWriteContract();
  const { writeContract: withdrawAll } = useWriteContract();
  const { writeContract: rebalance } = useWriteContract();

  // Wait for transactions
  const { isLoading: isApproving } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  const { isLoading: isDepositing, isSuccess: isDepositSuccess } = useWaitForTransactionReceipt({
    hash: depositHash,
  });

  const { isLoading: isWithdrawing, isSuccess: isWithdrawSuccess } = useWaitForTransactionReceipt({
    hash: withdrawHash,
  });

  // Handle deposit success
  useEffect(() => {
    if (isDepositSuccess) {
      refetchPosition();
      refetchStats();
      setDepositAmount('');
    }
  }, [isDepositSuccess, refetchPosition, refetchStats]);

  // Handle withdraw success
  useEffect(() => {
    if (isWithdrawSuccess) {
      refetchPosition();
      refetchStats();
      setWithdrawShares('');
    }
  }, [isWithdrawSuccess, refetchPosition, refetchStats]);

  const handleDeposit = async () => {
    if (!depositAmount || !address) return;
    
    const amount = parseUnits(depositAmount, 6);
    
    // First approve
    approve({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [VAULT_ADDRESS, amount],
    });
  };

  // Auto-deposit after approval
  useEffect(() => {
    if (approveHash && !isApproving && depositAmount) {
      const amount = parseUnits(depositAmount, 6);
      setTimeout(() => {
        deposit({
          address: VAULT_ADDRESS,
          abi: VAULT_ABI,
          functionName: 'deposit',
          args: [amount],
        });
      }, 1000);
    }
  }, [approveHash, isApproving]);

  const handleWithdraw = () => {
    if (!withdrawShares) return;
    
    withdraw({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'withdraw',
      args: [parseUnits(withdrawShares, 18)],
    });
  };

  const handleWithdrawAll = () => {
    if (!confirm('Are you sure you want to exit completely?')) return;
    
    withdrawAll({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'withdrawAll',
    });
  };

  const handleRebalance = () => {
    rebalance({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'rebalance',
    });
  };

  const getHealthClass = (hf: bigint) => {
    const value = Number(formatUnits(hf, 18));
    if (value > 1.5) return 'bg-green-100 text-green-800';
    if (value > 1.2) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 to-indigo-600 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 mb-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">
                🏦 HypurrFi Vault
              </h1>
              <p className="text-gray-600">Leveraged Yield Strategy</p>
            </div>
            <ConnectButton />
          </div>
        </div>

        {isConnected && position ? (
          <>
            {/* User Position */}
            <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 mb-8">
              <h2 className="text-2xl font-bold text-purple-600 mb-6">📊 Your Position</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="Shares"
                  value={Number(formatUnits(position.shares, 18)).toFixed(4)}
                />
                <StatCard
                  label="Net Value"
                  value={`$${Number(formatUnits(position.netValue, 6)).toFixed(2)}`}
                />
                <StatCard
                  label="Collateral"
                  value={`$${Number(formatUnits(position.collateralValue, 8)).toFixed(2)}`}
                />
                <StatCard
                  label="Debt"
                  value={`$${Number(formatUnits(position.debtValue, 8)).toFixed(2)}`}
                />
                <StatCard
                  label="Health Factor"
                  value={
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getHealthClass(position.healthFactor)}`}>
                      {Number(formatUnits(position.healthFactor, 18)).toFixed(2)}
                    </span>
                  }
                />
                <StatCard
                  label="Leverage"
                  value={`${(Number(position.leverageRatio) / 10000).toFixed(2)}x`}
                />
                <StatCard
                  label="LTV"
                  value={`${(Number(position.currentLTV) / 100).toFixed(2)}%`}
                />
              </div>
            </div>

            {/* Vault Stats */}
            {vaultStats && (
              <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 mb-8">
                <h2 className="text-2xl font-bold text-purple-600 mb-6">🏦 Vault Statistics</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard
                    label="TVL"
                    value={`$${Number(formatUnits(vaultStats.totalAssets, 6)).toFixed(2)}`}
                  />
                  <StatCard
                    label="APY"
                    value={`${(Number(vaultStats.currentAPY) / 1e25).toFixed(2)}%`}
                  />
                  <StatCard
                    label="Total Shares"
                    value={Number(formatUnits(vaultStats.totalShares, 18)).toFixed(2)}
                  />
                  <StatCard
                    label="Vault Health"
                    value={
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getHealthClass(vaultStats.healthFactor)}`}>
                        {Number(formatUnits(vaultStats.healthFactor, 18)).toFixed(2)}
                      </span>
                    }
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8">
              <h2 className="text-2xl font-bold text-purple-600 mb-6">🔧 Actions</h2>
              
              <div className="grid md:grid-cols-2 gap-6">
                {/* Deposit */}
                <div className="border-2 border-gray-200 rounded-xl p-6">
                  <h3 className="font-bold text-lg mb-4">Deposit</h3>
                  <input
                    type="number"
                    placeholder="Amount (USDC)"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg mb-4 focus:border-purple-500 focus:outline-none"
                    disabled={isApproving || isDepositing}
                  />
                  <button
                    onClick={handleDeposit}
                    disabled={!depositAmount || isApproving || isDepositing}
                    className="w-full bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isApproving ? 'Approving...' : isDepositing ? 'Depositing...' : 'Deposit'}
                  </button>
                </div>

                {/* Withdraw */}
                <div className="border-2 border-gray-200 rounded-xl p-6">
                  <h3 className="font-bold text-lg mb-4">Withdraw</h3>
                  <input
                    type="number"
                    placeholder="Shares to withdraw"
                    value={withdrawShares}
                    onChange={(e) => setWithdrawShares(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg mb-4 focus:border-purple-500 focus:outline-none"
                    disabled={isWithdrawing}
                  />
                  <button
                    onClick={handleWithdraw}
                    disabled={!withdrawShares || isWithdrawing}
                    className="w-full bg-gray-600 text-white py-3 rounded-lg font-bold hover:bg-gray-700 transition mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isWithdrawing ? 'Withdrawing...' : 'Withdraw'}
                  </button>
                  <button
                    onClick={handleWithdrawAll}
                    className="w-full bg-red-600 text-white py-3 rounded-lg font-bold hover:bg-red-700 transition"
                  >
                    Full Exit
                  </button>
                </div>
              </div>

              <button
                onClick={handleRebalance}
                className="w-full mt-6 bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 transition"
              >
                Rebalance Position
              </button>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-2xl shadow-2xl p-16 text-center">
            <p className="text-2xl text-gray-600 mb-6">
              {isConnected ? 'Loading position...' : 'Connect your wallet to get started'}
            </p>
            {!isConnected && <ConnectButton />}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-gray-50 p-4 rounded-lg border-l-4 border-purple-500">
      <div className="text-sm text-gray-600 mb-1">{label}</div>
      <div className="text-xl font-bold text-gray-800">{value}</div>
    </div>
  );
}
