// Steps build/racer-sim.js inside Goja, the JavaScript engine Nakama runs match handlers in,
// and reports the cost of one simulation tick.
//
//	go build -o gojabench . && ./gojabench ../../../build/racer-sim.js
//	./gojabench -courses track02 -configs 12:0,12:12 -profile cpu.pprof ../../../build/racer-sim.js
//	go tool pprof -top cpu.pprof
//	./gojabench -courses track03 -configs 12:0 -warmup 180 -ticks 600 -dump ticks.txt ../../../build/racer-sim.js
//
// With the modules already in the local Go cache, build offline with
// GOFLAGS=-mod=mod GOPROXY=off go build -o gojabench .
//
// A config is seats:humans. Human seats send a fixed throttle-and-steer input every tick.
package main

import (
	"flag"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/dop251/goja"
)

const setup = `
var __w = null;
var __in = {};
function mk(course, n, humans) {
  var seats = []; __in = {};
  for (var i = 0; i < n; i++) { var h = i < humans; seats.push({ kind: h ? 'remote' : 'ai' }); if (h) __in[i] = { throttle: 1, steer: (i % 3 - 1) * 0.12, brake: 0 }; }
  __w = RacerSim.createSimWorld({ courseId: course, seed: 77, seats: seats, finishRule: 'all_racers', finishGraceSeconds: 600 });
}
function stepN(n) { for (var i = 0; i < n; i++) __w.step(__in); }
function step1() { __w.step(__in); }
function wire() { return JSON.stringify(RacerSim.encodeWireSnapshot(__w, {})).length; }
function hash() { return RacerSim.stateHash(__w); }
`

func must(v goja.Value, err error) goja.Value {
	if err != nil {
		panic(err)
	}
	return v
}

func main() {
	courses := flag.String("courses", "track01,track02,track03", "comma-separated course ids")
	configs := flag.String("configs", "6:0,8:0,12:0", "comma-separated seats:humans pairs")
	ticks := flag.Int("ticks", 3600, "timed race ticks per config")
	warmup := flag.Int("warmup", 480, "untimed ticks first (countdown is 180)")
	profile := flag.String("profile", "", "write a Goja CPU profile (pprof) to this file")
	dump := flag.String("dump", "", "write every tick's cost in ms, one per line, to this file (last config run)")
	flag.Parse()
	if flag.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gojabench [flags] path/to/racer-sim.js")
		os.Exit(2)
	}
	src, err := os.ReadFile(flag.Arg(0))
	if err != nil {
		panic(err)
	}
	vm := goja.New()
	must(vm.RunString(string(src)))
	must(vm.RunString(setup))
	mk, _ := goja.AssertFunction(vm.Get("mk"))
	step1, _ := goja.AssertFunction(vm.Get("step1"))
	stepN, _ := goja.AssertFunction(vm.Get("stepN"))
	wire, _ := goja.AssertFunction(vm.Get("wire"))
	hash, _ := goja.AssertFunction(vm.Get("hash"))

	if *profile != "" {
		f, err := os.Create(*profile)
		if err != nil {
			panic(err)
		}
		defer f.Close()
		if err := goja.StartProfile(f); err != nil {
			panic(err)
		}
		defer goja.StopProfile()
	}

	fmt.Println("| Circuit | Seats | Humans | Mean ms | p95 | p99 | Max | Wire encode ms | stateHash ms | Hash at end |")
	fmt.Println("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
	for _, course := range strings.Split(*courses, ",") {
		for _, cfg := range strings.Split(*configs, ",") {
			parts := strings.Split(cfg, ":")
			n, _ := strconv.Atoi(parts[0])
			humans := 0
			if len(parts) > 1 {
				humans, _ = strconv.Atoi(parts[1])
			}
			must(mk(goja.Undefined(), vm.ToValue(course), vm.ToValue(n), vm.ToValue(humans)))
			must(stepN(goja.Undefined(), vm.ToValue(*warmup)))
			d := make([]float64, 0, *ticks)
			for i := 0; i < *ticks; i++ {
				t0 := time.Now()
				must(step1(goja.Undefined()))
				d = append(d, float64(time.Since(t0).Nanoseconds())/1e6)
			}
			end := must(hash(goja.Undefined())).String()
			if *dump != "" {
				var sb strings.Builder
				for _, v := range d {
					fmt.Fprintf(&sb, "%.4f\n", v)
				}
				if err := os.WriteFile(*dump, []byte(sb.String()), 0o644); err != nil {
					panic(err)
				}
			}
			sort.Float64s(d)
			sum := 0.0
			for _, v := range d {
				sum += v
			}
			t0 := time.Now()
			for i := 0; i < 200; i++ {
				must(wire(goja.Undefined()))
			}
			wireMs := float64(time.Since(t0).Microseconds()) / 1000 / 200
			t0 = time.Now()
			for i := 0; i < 50; i++ {
				must(hash(goja.Undefined()))
			}
			hashMs := float64(time.Since(t0).Microseconds()) / 1000 / 50
			fmt.Printf("| %s | %d | %d | %.3f | %.3f | %.3f | %.2f | %.3f | %.3f | %s |\n",
				course, n, humans, sum/float64(len(d)), d[int(float64(len(d))*0.95)], d[int(float64(len(d))*0.99)], d[len(d)-1], wireMs, hashMs, end)
		}
	}
}
