# Hack brief (verbatim transcript)

Source: three photographed pages of the printed brief, handed out at the event. Only the formatting was changed. The wording is exact.

---

**Moonfire Ventures Hack** · Cambridge Compute Co. · AIDDA

## The Hack

### Autoresearch for Real-World Value

### At a glance

- Apply autoresearch to a commercially valuable problem with a credible path to deployment.

### The challenge

Build an autoresearch application with a route to solving a commercially valuable, real-world problem. We are interested in systems that could be integrated into existing organisational workflows, not agents that produce impressive experiments in isolation.

Teams can build their own autoresearch framework, adapt an existing framework, or use one largely off the shelf. We care about whether the research loop, evaluator and deployment plan make sense for the problem.

Using an existing autoresearch framework is entirely welcome. In that case, put particular effort into explaining why your benchmark or evaluator measures the right thing, where it might fail, whether improvements are likely to generalise beyond the benchmark, and how the system would be used in practice.

### Illustrative use cases

- Cloud infrastructure: improve data-centre scheduling or resource allocation to reduce costs, energy use or idle capacity.
- Semiconductor manufacturing: search for scheduling algorithms that reduce production delays and bottlenecks while respecting factory constraints.
- Quantitative finance: optimise part of a trading or research pipeline, with realistic transaction costs, latency constraints and out-of-sample evaluation.
- Bioinformatics: improve sequence-alignment algorithms.

### What we want teams to show

- Valuable use case: What problem are you solving, who would benefit, and how would an improvement create value?
- Research loop and technical stack: What changes can the system propose? Where do agents, orchestration and experiments run? How is feedback used?
- Meaningful evaluator: Why does the benchmark or scoring function measure what matters in the real application? What are the risks of overfitting, or leakage?
- Practical adoption: How would this plug into an existing workflow? Consider reliability, cost, generalisability, interoperability and ease of use.
- Evidence, where feasible: Show experiments, baseline comparisons or a working prototype. Results are encouraged, but a polished end-to-end deployment is not expected.

### Judging criteria

- Commercial value and relevance of the use case - 20%
- Technical design, implementation and originality - 20%
- Evaluation and evidence (time allowing) - 20%
- Deployment feasibility, generalisability and interoperability - 20%
- Ease of use and communication - 20%

## Background

In the most general sense, **autoresearch** means research carried out in an automated way, for example by AI agents. While forms of automated search have existed for decades, recent advances in AI, particularly large language models and agentic systems, have made it possible to automate many parts of the research process.

In this event, when we say **autoresearch**, we mean autoresearch *à la* Andrej Karpathy, who is commonly associated with popularising the term "autoresearch", although many researchers and systems were using such ideas before him. Roughly, this refers to a repeated loop of

> **hypothesize → experiment / take an action → verify and score the result → repeat.**

The important feature is that the outcome of an experiment can be evaluated automatically against an objective metric. If the result improves the score, it can be retained and used as the starting point for further experimentation.

A useful name for this more specific paradigm is **verifiable autoresearch**: automated research in which progress can be objectively and automatically evaluated.

There are, of course, much more sophisticated versions of this basic loop. Google DeepMind's **AlphaEvolve**, for example, combines LLM-generated program modifications with automated evaluators and an evolutionary selection mechanism to iteratively discover better solutions. Open-source frameworks such as **OpenEvolve** implement similar ideas.

This feedback-driven approach is particularly valuable when improvements can be evaluated against real operational objectives, such as cost, speed, energy use or accuracy. That creates an opportunity to move beyond benchmark results towards systems that businesses can actually deploy.

### Why this theme?

Google DeepMind's AlphaEvolve offers an example of algorithm discovery with direct operational value: Google reports improvements to data-centre scheduling that recover an average of 0.7% of its worldwide compute resources (~$200 million saved per year).
