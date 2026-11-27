// Steps the generated server simulation (build/racer-sim.js) inside Goja, the
// JavaScript engine Nakama embeds, and prints the cost of one tick.
//
//	cd scripts/bench/gojabench && go run . [path/to/racer-sim.js]
//
// Needs Go. Not part of npm test. See ../README.md for the columns.
package main

import (
	"fmt"
	"os"
	"sort"
	"time"

	"github.com/dop251/goja"
)

func main() {
	path := "../../../build/racer-sim.js"
	if len(os.Args) > 1 {
		path = os.Args[1]
	}
	src, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "cannot read %s: run from scripts/bench/gojabench or pass the path to racer-sim.js\n", path)
		os.Exit(1)
	}
	vm := goja.New()
	if _, err := vm.RunString(string(src)); err != nil {
		panic(err)
	}
	setup := `
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
	if _, err := vm.RunString(setup); err != nil {
		panic(err)
	}
	mk, _ := goja.AssertFunction(vm.Get("mk"))
	step1, _ := goja.AssertFunction(vm.Get("step1"))
	stepN, _ := goja.AssertFunction(vm.Get("stepN"))
	wire, _ := goja.AssertFunction(vm.Get("wire"))
	hash, _ := goja.AssertFunction(vm.Get("hash"))
	for _, course := range []string{"track02"} {
		for _, hn := range [][2]int{{12, 0}, {12, 6}, {12, 12}, {6, 0}, {6, 6}, {8, 0}, {8, 8}} {
			n := hn[0]
			if _, err := mk(goja.Undefined(), vm.ToValue(course), vm.ToValue(n), vm.ToValue(hn[1])); err != nil {
				panic(err)
			}
			if _, err := stepN(goja.Undefined(), vm.ToValue(180+300)); err != nil {
				panic(err)
			}
			const ticks = 60 * 60
			d := make([]float64, 0, ticks)
			for i := 0; i < ticks; i++ {
				t0 := time.Now()
				if _, err := step1(goja.Undefined()); err != nil {
					panic(err)
				}
				d = append(d, float64(time.Since(t0).Microseconds())/1000)
			}
			sort.Float64s(d)
			sum := 0.0
			for _, v := range d {
				sum += v
			}
			t0 := time.Now()
			for i := 0; i < 200; i++ {
				wire(goja.Undefined())
			}
			wireMs := float64(time.Since(t0).Microseconds()) / 1000 / 200
			t0 = time.Now()
			for i := 0; i < 50; i++ {
				hash(goja.Undefined())
			}
			hashMs := float64(time.Since(t0).Microseconds()) / 1000 / 50
			fmt.Printf("%s humans=%d seats=%2d  tick mean %.3f ms  p95 %.3f  p99 %.3f  max %.2f | encode+stringify %.3f ms | stateHash %.3f ms\n",
				course, hn[1], n, sum/float64(len(d)), d[int(float64(len(d))*0.95)], d[int(float64(len(d))*0.99)], d[len(d)-1], wireMs, hashMs)
		}
	}
}
