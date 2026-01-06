# Yegam → Polymarket Clone Implementation Plan

## Project Overview

Transform Yegam from a simple binary prediction market into a full Polymarket-style platform using GAM virtual currency.

**Keep**:
- 8 Korean categories (정치, 스포츠, 경제, 코인, 테크, 엔터, 날씨, 해외)
- Discussion forum (분석방)
- GAM virtual currency system
- User authentication system

**Remove**:
- Minigames (Bustabit)

**Add**:
- Multi-outcome markets
- Polymarket-style UI
- Live sports betting
- Trending/Breaking/New sorting
- Bookmarks
- Quick filter tags

---

## Phase 0: Cleanup - Remove Minigames

### Files to Delete
```
/services/minigames/bustabit-engine.js
/routes/minigames/bustabit.js
/routes/minigames/index.js
/js/minigames/bustabit-client.js
/js/pages/minigames.js
/css/minigames.css
/minigames.html
```

### Files to Modify
```
/server.js - Remove minigame routes and Bustabit initialization
/index.html - Remove minigame navigation link
/mypage.html - Remove minigame link
```

---

## Phase 1: Database Schema Overhaul

### Current Schema (Binary Markets)
```sql
issues (
  id, title, category,
  yes_price, yes_volume, no_volume,  -- Binary only
  status, result
)

bets (
  id, user_id, issue_id,
  choice VARCHAR(10),  -- 'YES' or 'NO' only
  amount
)
```

### New Schema (Multi-Outcome Markets)

```sql
-- Markets table (replaces issues)
CREATE TABLE markets (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,
    image_url TEXT,

    -- Market type
    market_type VARCHAR(20) DEFAULT 'binary',  -- 'binary', 'multiple', 'scalar'

    -- Resolution
    resolution_source TEXT,  -- Where to verify outcome
    end_date TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'active',  -- 'active', 'closed', 'resolved', 'voided'

    -- Stats
    total_volume INTEGER DEFAULT 0,
    unique_traders INTEGER DEFAULT 0,

    -- Metadata
    tags TEXT[],  -- For quick filters: ['trump', 'venezuela', 'fed']
    resolution_timeframe VARCHAR(20),  -- 'daily', 'weekly', 'monthly', 'custom'
    is_trending BOOLEAN DEFAULT FALSE,
    is_breaking BOOLEAN DEFAULT FALSE,

    -- Sports specific
    is_live BOOLEAN DEFAULT FALSE,
    live_data JSONB,  -- {quarter: 'Q4', time: '06:52', league: 'NBA'}

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Outcomes table (multi-outcome support)
CREATE TABLE outcomes (
    id SERIAL PRIMARY KEY,
    market_id INTEGER REFERENCES markets(id) ON DELETE CASCADE,

    title VARCHAR(200) NOT NULL,  -- 'Yes', 'No', 'January 10', 'Kevin Hassett', etc.
    description TEXT,
    image_url TEXT,

    -- Pricing (probability)
    probability DECIMAL(5,2) DEFAULT 50.00,  -- 0.00 to 100.00

    -- Volume
    volume INTEGER DEFAULT 0,

    -- Resolution
    is_winner BOOLEAN DEFAULT NULL,  -- NULL = unresolved, TRUE = won, FALSE = lost

    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Positions table (replaces bets)
CREATE TABLE positions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    market_id INTEGER REFERENCES markets(id) ON DELETE CASCADE,
    outcome_id INTEGER REFERENCES outcomes(id) ON DELETE CASCADE,

    -- Position details
    shares DECIMAL(12,4) NOT NULL,  -- Number of shares owned
    avg_price DECIMAL(5,4) NOT NULL,  -- Average purchase price
    total_cost INTEGER NOT NULL,  -- Total GAM spent

    -- Status
    is_sold BOOLEAN DEFAULT FALSE,
    sold_at TIMESTAMPTZ,
    profit_loss INTEGER,  -- Realized P/L

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(user_id, outcome_id)  -- One position per user per outcome
);

-- Trades table (transaction history)
CREATE TABLE trades (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    market_id INTEGER REFERENCES markets(id) ON DELETE CASCADE,
    outcome_id INTEGER REFERENCES outcomes(id) ON DELETE CASCADE,

    trade_type VARCHAR(10) NOT NULL,  -- 'buy', 'sell'
    shares DECIMAL(12,4) NOT NULL,
    price DECIMAL(5,4) NOT NULL,  -- Price per share (0.01 to 0.99)
    total_amount INTEGER NOT NULL,  -- Total GAM

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Bookmarks table
CREATE TABLE bookmarks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    market_id INTEGER REFERENCES markets(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, market_id)
);

-- Market tags for quick filters
CREATE TABLE market_tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(50) NOT NULL,
    usage_count INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_markets_category ON markets(category);
CREATE INDEX idx_markets_status ON markets(status);
CREATE INDEX idx_markets_end_date ON markets(end_date);
CREATE INDEX idx_markets_trending ON markets(is_trending);
CREATE INDEX idx_markets_tags ON markets USING GIN(tags);
CREATE INDEX idx_outcomes_market ON outcomes(market_id);
CREATE INDEX idx_outcomes_probability ON outcomes(probability DESC);
CREATE INDEX idx_positions_user ON positions(user_id);
CREATE INDEX idx_positions_market ON positions(market_id);
CREATE INDEX idx_trades_user ON trades(user_id);
CREATE INDEX idx_trades_market ON trades(market_id);
CREATE INDEX idx_bookmarks_user ON bookmarks(user_id);
```

### Data Migration
```sql
-- Migrate existing issues to new markets table
INSERT INTO markets (id, title, description, category, image_url, market_type, end_date, status, total_volume, created_at)
SELECT id, title, description, category, image_url, 'binary', end_date, status, total_volume, created_at
FROM issues;

-- Create YES/NO outcomes for each binary market
INSERT INTO outcomes (market_id, title, probability, volume, display_order)
SELECT id, 'Yes', yes_price, yes_volume, 0 FROM issues
UNION ALL
SELECT id, 'No', 100 - yes_price, no_volume, 1 FROM issues;

-- Migrate bets to positions
INSERT INTO positions (user_id, market_id, outcome_id, shares, avg_price, total_cost)
SELECT
    b.user_id,
    b.issue_id,
    o.id,
    b.amount / 100.0,  -- Convert to shares
    0.50,  -- Default avg price
    b.amount
FROM bets b
JOIN outcomes o ON o.market_id = b.issue_id
    AND o.title = CASE WHEN b.choice = 'YES' THEN 'Yes' ELSE 'No' END;
```

---

## Phase 2: API Overhaul

### New API Endpoints

```
# Markets
GET    /api/markets                    # List markets with filters
GET    /api/markets/:id                # Get market details
GET    /api/markets/:id/outcomes       # Get market outcomes
GET    /api/markets/trending           # Trending markets
GET    /api/markets/breaking           # Breaking news markets
POST   /api/markets                    # Create market (admin)
PUT    /api/markets/:id                # Update market (admin)
POST   /api/markets/:id/resolve        # Resolve market (admin)

# Trading
POST   /api/trade/buy                  # Buy shares
POST   /api/trade/sell                 # Sell shares
GET    /api/trade/quote                # Get price quote

# Positions
GET    /api/positions                  # User's positions
GET    /api/positions/:marketId        # Position in specific market

# Bookmarks
GET    /api/bookmarks                  # User's bookmarks
POST   /api/bookmarks/:marketId        # Add bookmark
DELETE /api/bookmarks/:marketId        # Remove bookmark

# Tags
GET    /api/tags                       # Get all tags
GET    /api/tags/featured              # Featured filter tags
```

### AMM Pricing Formula (Polymarket-style)

```javascript
// Constant Product Market Maker (CPMM) for binary markets
class BinaryAMM {
    constructor(yesShares, noShares) {
        this.yes = yesShares;
        this.no = noShares;
        this.k = yesShares * noShares;  // Constant product
    }

    getYesPrice() {
        return this.no / (this.yes + this.no);
    }

    getNoPrice() {
        return this.yes / (this.yes + this.no);
    }

    buyYes(amount) {
        const newNo = this.k / (this.yes + amount);
        const sharesOut = this.no - newNo;
        return { shares: sharesOut, avgPrice: amount / sharesOut };
    }

    sellYes(shares) {
        const newNo = this.no + shares;
        const newYes = this.k / newNo;
        const gamOut = this.yes - newYes;
        return { amount: gamOut, avgPrice: gamOut / shares };
    }
}

// Multi-outcome LMSR (Logarithmic Market Scoring Rule)
class MultiOutcomeAMM {
    constructor(outcomes, liquidity = 1000) {
        this.outcomes = outcomes;  // [{id, shares}]
        this.b = liquidity;  // Liquidity parameter
    }

    getPrices() {
        const expSum = this.outcomes.reduce((sum, o) =>
            sum + Math.exp(o.shares / this.b), 0);
        return this.outcomes.map(o => ({
            id: o.id,
            price: Math.exp(o.shares / this.b) / expSum
        }));
    }

    getCost(outcomeId, shares) {
        // Cost to buy 'shares' of outcomeId
        const oldCost = this.b * Math.log(
            this.outcomes.reduce((s, o) => s + Math.exp(o.shares / this.b), 0)
        );

        const newOutcomes = this.outcomes.map(o => ({
            ...o,
            shares: o.id === outcomeId ? o.shares + shares : o.shares
        }));

        const newCost = this.b * Math.log(
            newOutcomes.reduce((s, o) => s + Math.exp(o.shares / this.b), 0)
        );

        return newCost - oldCost;
    }
}
```

---

## Phase 3: Frontend Transformation

### New Component Structure

```
/js/
├── app.js                    # Main entry (simplified)
├── api/
│   ├── markets.js           # Market API calls
│   ├── trading.js           # Trading API calls
│   └── bookmarks.js         # Bookmark API calls
├── components/
│   ├── MarketCard.js        # Polymarket-style card
│   ├── OutcomeRow.js        # Single outcome row
│   ├── TradeModal.js        # Buy/sell modal
│   ├── ProbabilityBadge.js  # Colored probability circle
│   ├── VolumeDisplay.js     # Volume formatter
│   ├── CategoryNav.js       # Top navigation
│   ├── FilterTags.js        # Quick filter chips
│   ├── SearchBar.js         # Search functionality
│   └── BookmarkButton.js    # Bookmark toggle
├── pages/
│   ├── home.js              # Main market listing
│   ├── market-detail.js     # Single market page
│   ├── portfolio.js         # User positions
│   └── discussions.js       # Keep existing forum
└── utils/
    ├── formatters.js        # GAM, volume formatters
    └── amm.js               # Client-side AMM calculations
```

### Polymarket Card Design

```html
<!-- Market Card Template -->
<div class="market-card">
    <div class="market-header">
        <img class="market-icon" src="..." alt="">
        <div class="market-title">Will Trump acquire Greenland before 2027?</div>
        <div class="probability-badge" style="--prob-color: #ef4444">
            10%
        </div>
    </div>

    <div class="outcomes">
        <div class="outcome-row">
            <button class="outcome-btn yes">Yes</button>
            <button class="outcome-btn no">No</button>
        </div>
    </div>

    <div class="market-footer">
        <span class="volume">$404k Vol.</span>
        <button class="bookmark-btn">
            <svg><!-- bookmark icon --></svg>
        </button>
    </div>
</div>

<!-- Multi-Outcome Card -->
<div class="market-card multi-outcome">
    <div class="market-header">
        <img class="market-icon" src="..." alt="">
        <div class="market-title">Who will Trump nominate as Fed Chair?</div>
    </div>

    <div class="outcomes">
        <div class="outcome-row">
            <span class="outcome-name">Kevin Hassett</span>
            <span class="outcome-prob">41%</span>
            <button class="btn-yes">Yes</button>
            <button class="btn-no">No</button>
        </div>
        <div class="outcome-row">
            <span class="outcome-name">Kevin Warsh</span>
            <span class="outcome-prob">37%</span>
            <button class="btn-yes">Yes</button>
            <button class="btn-no">No</button>
        </div>
    </div>

    <div class="market-footer">
        <span class="volume">$130m Vol.</span>
        <button class="bookmark-btn">
            <svg><!-- bookmark icon --></svg>
        </button>
    </div>
</div>

<!-- Live Sports Card -->
<div class="market-card sports live">
    <div class="teams">
        <div class="team">
            <img src="..." class="team-logo">
            <span class="team-name">24 Nuggets</span>
            <span class="team-prob">49%</span>
        </div>
        <div class="team">
            <img src="..." class="team-logo">
            <span class="team-name">21 76ers</span>
            <span class="team-prob">52%</span>
        </div>
    </div>

    <div class="team-buttons">
        <button class="team-btn nuggets">Nuggets</button>
        <button class="team-btn sixers">76ers</button>
    </div>

    <div class="market-footer">
        <span class="live-indicator">● Q4 - 06:52</span>
        <span class="volume">$4m Vol.</span>
        <span class="league">NBA</span>
        <button class="bookmark-btn">
            <svg><!-- bookmark icon --></svg>
        </button>
    </div>
</div>
```

### CSS Design System (Polymarket-style)

```css
:root {
    /* Colors */
    --bg-primary: #ffffff;
    --bg-secondary: #f8fafc;
    --bg-card: #ffffff;
    --border-color: #e2e8f0;

    --text-primary: #1e293b;
    --text-secondary: #64748b;
    --text-muted: #94a3b8;

    --yes-color: #22c55e;
    --yes-bg: #dcfce7;
    --no-color: #ef4444;
    --no-bg: #fee2e2;

    --accent-blue: #3b82f6;
    --accent-purple: #8b5cf6;

    /* Shadows */
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
    --shadow-md: 0 4px 6px rgba(0,0,0,0.07);

    /* Border radius */
    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 12px;
}

/* Market Card */
.market-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: 16px;
    transition: box-shadow 0.2s;
}

.market-card:hover {
    box-shadow: var(--shadow-md);
}

/* Probability Badge */
.probability-badge {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 14px;
    background: conic-gradient(
        var(--prob-color) calc(var(--prob) * 3.6deg),
        #e2e8f0 0
    );
}

/* Yes/No Buttons */
.outcome-btn {
    flex: 1;
    padding: 10px 16px;
    border-radius: var(--radius-md);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
}

.outcome-btn.yes {
    background: var(--yes-bg);
    color: var(--yes-color);
    border: 1px solid var(--yes-color);
}

.outcome-btn.yes:hover {
    background: var(--yes-color);
    color: white;
}

.outcome-btn.no {
    background: var(--no-bg);
    color: var(--no-color);
    border: 1px solid var(--no-color);
}

.outcome-btn.no:hover {
    background: var(--no-color);
    color: white;
}

/* Live Indicator */
.live-indicator {
    color: var(--no-color);
    font-size: 12px;
    font-weight: 500;
}

.live-indicator::before {
    content: '';
    display: inline-block;
    width: 6px;
    height: 6px;
    background: var(--no-color);
    border-radius: 50%;
    margin-right: 4px;
    animation: pulse 1.5s infinite;
}

/* Grid Layout */
.markets-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
}

@media (min-width: 1200px) {
    .markets-grid {
        grid-template-columns: repeat(4, 1fr);
    }
}
```

### Navigation Structure

```html
<header class="main-header">
    <div class="header-left">
        <a href="/" class="logo">
            <img src="/logo.svg" alt="Yegam">
            <span>Yegam</span>
        </a>
        <div class="search-bar">
            <input type="text" placeholder="Search yegam">
        </div>
    </div>

    <div class="header-right">
        <span class="gam-balance">
            <img src="/gam-icon.svg" alt="GAM">
            <span>12,450 GAM</span>
        </span>
        <button class="btn-login">Log In</button>
        <button class="btn-signup">Sign Up</button>
    </div>
</header>

<nav class="category-nav">
    <a href="?sort=trending" class="nav-item active">
        <svg><!-- trending icon --></svg>
        Trending
    </a>
    <a href="?sort=breaking" class="nav-item">Breaking</a>
    <a href="?sort=new" class="nav-item">New</a>
    <span class="nav-divider"></span>
    <a href="?category=정치" class="nav-item">정치</a>
    <a href="?category=스포츠" class="nav-item">스포츠</a>
    <a href="?category=경제" class="nav-item">경제</a>
    <a href="?category=코인" class="nav-item">코인</a>
    <a href="?category=테크" class="nav-item">테크</a>
    <a href="?category=엔터" class="nav-item">엔터</a>
    <a href="?category=날씨" class="nav-item">날씨</a>
    <a href="?category=해외" class="nav-item">해외</a>
    <a href="/discussions" class="nav-item">분석방</a>
</nav>

<div class="filter-tags">
    <button class="filter-tag active">All</button>
    <button class="filter-tag">윤석열</button>
    <button class="filter-tag">비트코인</button>
    <button class="filter-tag">손흥민</button>
    <button class="filter-tag">애플</button>
    <button class="filter-tag">삼성</button>
    <button class="filter-tag">연준</button>
    <!-- More tags -->
</div>
```

---

## Phase 4: Implementation Timeline

### Week 1-2: Database & Backend
- [ ] Remove minigames completely
- [ ] Create new database schema
- [ ] Migrate existing data
- [ ] Implement AMM pricing engine
- [ ] Create new API endpoints
- [ ] Add bookmark system
- [ ] Add tagging system

### Week 3-4: Frontend Core
- [ ] Create Polymarket-style market cards
- [ ] Implement 4-column grid layout
- [ ] Build category navigation
- [ ] Add filter tags
- [ ] Implement search functionality
- [ ] Create trade modal

### Week 5: Polish & Features
- [ ] Add trending/breaking algorithms
- [ ] Implement real-time price updates
- [ ] Portfolio page redesign
- [ ] Mobile responsiveness
- [ ] Performance optimization

### Week 6: Testing & Launch
- [ ] End-to-end testing
- [ ] Data migration verification
- [ ] Performance testing
- [ ] Bug fixes
- [ ] Production deployment

---

## Files to Create/Modify

### New Files
```
/database/polymarket-schema.sql      # New schema
/database/migrate-to-polymarket.sql  # Migration script
/services/amm-engine.js              # AMM pricing
/routes/markets.js                   # Markets API
/routes/trading.js                   # Trading API
/routes/bookmarks.js                 # Bookmarks API
/js/components/*.js                  # New UI components
/css/polymarket.css                  # New styles
/markets.html                        # New main page (or modify index.html)
/market.html                         # Single market page
/portfolio.html                      # User portfolio
```

### Files to Delete
```
/services/minigames/
/routes/minigames/
/js/minigames/
/js/pages/minigames.js
/css/minigames.css
/minigames.html
```

### Files to Heavily Modify
```
/server.js                  # Remove minigames, add new routes
/index.html                 # Complete redesign
/js/app.js                  # Rewrite for new architecture
/css/style.css              # Add Polymarket styles
/database/postgres.js       # Add new tables
```

---

## Success Metrics

1. **Visual Parity**: UI looks 90%+ like Polymarket
2. **Multi-Outcome**: Support markets with 2-10 outcomes
3. **Trading UX**: Buy/sell in <3 clicks
4. **Performance**: Page load <2 seconds
5. **Mobile**: Full functionality on mobile

---

## Questions to Resolve

1. **Live Sports**: Do you want real-time sports data integration (requires API)?
2. **Resolution**: Should markets auto-resolve or always manual?
3. **Trading Limits**: Max position size per market?
4. **Fee Structure**: Any trading fees (like Polymarket's 2%)?

---

*Document Created: 2025-01-06*
*Estimated Total Effort: 5-6 weeks*
