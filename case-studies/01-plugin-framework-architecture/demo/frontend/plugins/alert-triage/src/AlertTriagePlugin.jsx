import React from 'react';
import {
  buildPluginUrl,
  fetchJson,
  MetricCard,
  MetricGrid,
  Panel,
  PluginEyebrow,
  RemoteStatus,
} from '@platform';

const SUMMARY_ENDPOINT = '/summary';
const FALLBACK_API_BASE_PATH = '/api/extensions/alert-triage';

function summarize(snapshot) {
  const eventsBySeverity = snapshot.timeline
    .flatMap((entry) => entry.events)
    .reduce(
      (counts, event) => ({
        ...counts,
        [event.severity]: (counts[event.severity] ?? 0) + 1,
      }),
      { critical: 0, warning: 0, info: 0 }
    );

  const openActions = snapshot.timeline
    .filter((entry) => entry.status === 'down')
    .map((entry) => ({
      device: entry.device,
      owner: 'host-snapshot',
      action: `Review latest events for ${entry.device}`,
    }));

  return {
    source: 'host-snapshot',
    eventsBySeverity,
    openActions,
    highestPriority: eventsBySeverity.critical > 0 ? 'critical' : 'normal',
  };
}

export default class AlertTriagePlugin extends React.Component {
  state = {
    summary: summarize(this.props.snapshot),
    backendStatus: 'Loading plugin backend...',
  };

  componentDidMount() {
    this.loadSummary();
  }

  componentDidUpdate(previousProps) {
    if (previousProps.plugin?.apiBasePath !== this.props.plugin?.apiBasePath) {
      this.loadSummary();
    }
  }

  loadSummary() {
    fetchJson(buildPluginUrl(this.props.plugin, SUMMARY_ENDPOINT, FALLBACK_API_BASE_PATH), 'Plugin API')
      .then((summary) => this.setState({ summary, backendStatus: 'Integrated backend active' }))
      .catch(() =>
        this.setState({
          summary: summarize(this.props.snapshot),
          backendStatus: 'Using host snapshot fallback',
        })
      );
  }

  render() {
    const { summary, backendStatus } = this.state;
    const { eventsBySeverity, openActions } = summary;

    return (
      <Panel className="remote-panel">
        <PluginEyebrow>Remote React plugin</PluginEyebrow>
        <h2>Alert triage remote</h2>
        <MetricGrid>
          <MetricCard label="Critical" value={eventsBySeverity.critical} />
          <MetricCard label="Warnings" value={eventsBySeverity.warning} />
          <MetricCard label="Open actions" value={openActions.length} />
        </MetricGrid>
        <div className="event-list">
          {openActions.map((action) => (
            <div className="event critical" key={`${action.device}-${action.owner}`}>
              <span>{action.owner}</span>
              <p>{action.action}</p>
            </div>
          ))}
        </div>
        <RemoteStatus>
          {backendStatus} · priority {summary.highestPriority}
        </RemoteStatus>
      </Panel>
    );
  }
}
