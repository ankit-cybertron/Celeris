PY ?= $(if $(wildcard .venv/bin/python),.venv/bin/python,python3)
export PYTHONPATH := src

.PHONY: all setup clean anomalies backtest forecast dashboard test fast insights export web-install web web-build
all: clean anomalies backtest forecast insights export       ## one command: raw data -> submission + dashboard inputs
setup:        ; $(PY) -m pip install -r requirements.txt
clean:        ; $(PY) -m mks.cli clean
anomalies:    ; $(PY) -m mks.cli anomalies
backtest:     ; $(PY) -m mks.cli backtest
forecast:     ; $(PY) -m mks.cli forecast
insights:     ; $(PY) -m mks.cli insights
export:       ; $(PY) -m mks.cli export
fast:         ; $(PY) -m mks.cli all --fast
test:         ; $(PY) -m pytest -q
dashboard:    ; $(MAKE) web
web-install:  ; cd web && npm install --legacy-peer-deps
web:          ; cd web && npm run dev -- --host 127.0.0.1
web-build:    ; cd web && npm run build
