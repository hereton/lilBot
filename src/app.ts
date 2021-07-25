/* W O R K I N G  T I T L E 
 * TradingView charts and indicators are the best. I prefer them to Binance's 
 * charts, so I made a bot that uses TradingView indicators, strategies, and
 * alerts. It's simple enough that even a javascript novice can start using 
 * it right away. Working Title was designed to be used as a base for other 
 * projects.
 * 
 * Working Title makes extensive use of Jon Eryck's Node-Binance-API project
 * which can be found here: https://github.com/jaggedsoft/node-binance-api
 * Thanks Jon!
 *****************************************************************************/
const Binance = require('node-binance-api');
import http from 'http'
import axios from 'axios'
import events from 'events'
const qs = require('querystring');


require('dotenv').config();

const LINE_NOTIFY_URL = 'https://notify-api.line.me/api/notify'
const DISCORD_URL = process.env.DISCORD

const binance = new Binance().options({
    APIKEY: process.env.BINANCE_APIKEY,
    APISECRET: process.env.BINANCE_SECRET,
    useServerTime: true,
    recvWindow: 1500, // Set a higher recvWindow to increase response timeout
    verbose: false, // Add extra output when subscribing to WebSockets, etc
    test: true,
    reconnect: true
    // to do: enable Logging
});

interface ITicker {
    symbol: string
    bidPrice: string
    bidQty: string
    askPrice: string
    askQty: string
}

const getSymbol = (body: string) => {
    return body.split(':')[1]
}
const getAmount = (body: string) => {
    return body.split('amount:')[1]?.trim()
}

const sendLineNotify = async (text: string, token: string) => {
    const params = {
        message: text
    }
    const options = {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Bearer ${token}`,
        }
    };

    await axios.post(LINE_NOTIFY_URL, qs.stringify(params), options);
}

const getAvailableQty = (qty: number, ticker: ITicker) => {

    // console.log('qty', qty)
    // console.log('ask Qty', ticker.askQty)
    let countDecimal = parseFloat(ticker.askQty).toString().split('.')[1]?.length || 0
    if (countDecimal) {
        const POW_NUMBER = Math.pow(10, countDecimal)
        // console.log('pow number', POW_NUMBER)
        return (Math.floor(qty * POW_NUMBER) / POW_NUMBER)
    }
    return (Math.floor(qty * 10) / 10)
}

const hostname = '127.0.0.1';
const port = process.env.PORT || 8080;

// Are we in test mode?
console.log("Test Mode: ", binance.getOption('test'));

const eventEmitter = new events.EventEmitter();

eventEmitter.on('error', (err: any) => {
    console.error(err);
})

eventEmitter.on('buy', (symbol, amount?: number) => {
    binance.balance((error: any, balances: any) => {
        if (error) return console.error(error);
        let usdtBal = balances.USDT.available
        if (amount && amount < usdtBal) {
            usdtBal = amount
        } else {
            usdtBal = usdtBal - 1
        }
        // const usdtBal = 11
        if (balances.USDT.available > 10.00) {
            binance.bookTickers(symbol, (error: any, ticker: any) => {
                console.log(ticker)
                let tickAsk = ticker.askPrice;
                let qty: any = usdtBal / tickAsk;
                let availableQty: number = getAvailableQty(qty, ticker)
                console.log()
                console.log(` Buying ${symbol}, available USDT ${usdtBal}, available qty ${availableQty}`);
                binance.marketBuy(symbol, availableQty, (error: any, response: any) => {
                    if (error) {
                        console.log(error.body)
                    } else {
                        console.log('response')
                        console.log(response)
                    }
                });
            });
        }
        else {
            console.log(`Cannot but ${symbol}`)
            console.log(' Balance < 10.00')
        }
    })
})

eventEmitter.on('sell', async (symbol: string) => {
    try {

        await binance.balance(async (error: any, balances: any) => {
            if (error) return console.error(error);
            binance.bookTickers(symbol, async (error: any, ticker: any) => {
                //check leverage ticker token 
                const checkedTicker: string = symbol.includes('USDT') ? symbol.replace('USDT', '') : symbol
                let availableQty: number = parseFloat(balances[checkedTicker].available || 0)
                availableQty = getAvailableQty(availableQty, ticker)
                if (availableQty) {
                    // const availableQty = getAvailableQty(availableQty, symbol)
                    const response = await binance.marketSell(symbol, availableQty, (error: any, response: any) => {
                        if (error) {
                            console.log(error.body)
                        } else {
                            console.log('response')
                            console.log(response)
                        }
                    });
                } else {
                    console.log(`Cannot Sell ${symbol}`)
                }
            });
        })
    }
    catch (e) {
        console.log(e)
        return
    }
})

const server = http.createServer((req: any, res: any) => {
    //const { headers, method, url } = req;
    let body: any[] = [];
    req.on('error', (err: any) => {
        console.error(err);
    }).on('data', (chunk: any) => {
        body.push(chunk);
    }).on('end', async () => {
        let text: string = Buffer.concat(body).toString();
        if (text.includes('buy')) {
            const symbol = getSymbol(text)
            const amount = getAmount(text)
            console.log('amount ', amount)
            await eventEmitter.emit('buy', symbol, amount); // <----------------------- BUY
            // if (process.env.LINE_TOKEN) {
            //     await sendLineNotify(text, process.env.LINE_TOKEN)
            // }
        }
        else if (text.includes('sell')) {
            const symbol = getSymbol(text)
            await eventEmitter.emit('sell', symbol); // <---------------------- SELL
        }

        // console.log(text);
        res.statusCode = 200;
        console.log('hook ', text)
        res.end();
    }
    )
}
);

server.listen(port as number, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});