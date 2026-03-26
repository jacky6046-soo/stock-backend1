from flask import Flask, request, jsonify
from flask_cors import CORS
import yfinance as yf

app = Flask(__name__)
CORS(app) # Enable CORS for all routes so our local HTML file can access it

@app.route('/api/quote', methods=['GET'])
def get_quote():
    tickers = request.args.get('tickers', '')
    if not tickers:
        return jsonify([])
    
    ticker_list = [t.strip() for t in tickers.split(',') if t.strip()]
    results = []
    
    for t in ticker_list:
        try:
            ticker = yf.Ticker(t)
            # Use '1mo' (month) to ensure we get some trading days and skip weekends/holidays fast
            hist = ticker.history(period="1mo")
            if hist.empty:
                continue
            
            current_price = hist['Close'].iloc[-1]
            if len(hist['Close']) > 1:
                prev_close = hist['Close'].iloc[-2]
            else:
                prev_close = current_price
                
            change_percent = ((current_price - prev_close) / prev_close) * 100
            
            # fast_info is significantly quicker than info!
            fast_info = ticker.fast_info
            name = t # fallback
            try:
                # Some tickers might fail on .info fetching 
                info = ticker.info
                name = info.get('shortName') or info.get('longName') or t
            except:
                pass
            
            results.append({
                "ticker": t,
                "name": name,
                "price": float(current_price),
                "change": float(change_percent)
            })
        except Exception as e:
            print(f"Error fetching quote for {t}: {e}")
            continue
            
    return jsonify(results)

@app.route('/api/history', methods=['GET'])
def get_history():
    ticker_symbol = request.args.get('ticker')
    if not ticker_symbol:
        return jsonify([])
        
    try:
        ticker = yf.Ticker(ticker_symbol)
        # Fetch up to 3 months of daily data to seed the interactive chart
        hist = ticker.history(period="3mo")
        if hist.empty:
            return jsonify([])
            
        data = []
        for index, row in hist.iterrows():
            # index is a pandas Timestamp object with timezone info
            val = float(row['Close'])
            # Drop NaN values 
            if val != val: continue 
            
            data.append({
                "time": int(index.timestamp()),
                "value": val
            })
        return jsonify(data)
    except Exception as e:
        print(f"Error fetching history for {ticker_symbol}: {e}")
        return jsonify([])

@app.route('/api/news', methods=['GET'])
def get_news():
    ticker_symbol = request.args.get('ticker')
    if not ticker_symbol:
        return jsonify([])
        
    try:
        ticker = yf.Ticker(ticker_symbol)
        news_items = ticker.news
        if not news_items:
            return jsonify([])
            
        from datetime import datetime
        formatted_news = []
        for item in news_items[:5]:
            pub_time = item.get('providerPublishTime')
            time_str = "刚刚"
            if pub_time:
                diff = datetime.now().timestamp() - pub_time
                if diff < 3600:
                    time_str = f"{int(diff//60)}分钟前"
                elif diff < 86400:
                    time_str = f"{int(diff//3600)}小时前"
                else:
                    time_str = f"{int(diff//86400)}天前"
                    
            formatted_news.append({
                "tag": item.get('publisher', '新闻'),
                "title": item.get('title', '未知标题'),
                "time": time_str,
                "link": item.get('link', '#')
            })
            
        return jsonify(formatted_news)
    except Exception as e:
        print(f"Error fetching news for {ticker_symbol}: {e}")
        return jsonify([])

if __name__ == '__main__':
    print("Starting yfinance API backend on http://127.0.0.1:5000")
    app.run(port=5000, debug=True)
