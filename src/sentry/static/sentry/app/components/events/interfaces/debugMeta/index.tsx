import isNil from 'lodash/isNil';
import React from 'react';
import styled from '@emotion/styled';
import {AutoSizer} from 'react-virtualized/dist/commonjs/AutoSizer';
import {List, ListRowProps} from 'react-virtualized/dist/commonjs/List';
import {
  CellMeasurer,
  CellMeasurerCache,
} from 'react-virtualized/dist/commonjs/CellMeasurer';

import space from 'app/styles/space';
import GuideAnchor from 'app/components/assistant/guideAnchor';
import Button from 'app/components/button';
import Checkbox from 'app/components/checkbox';
import EventDataSection from 'app/components/events/eventDataSection';
import {Panel, PanelItem} from 'app/components/panels';
import DebugMetaStore, {DebugMetaActions} from 'app/stores/debugMetaStore';
import SearchBar from 'app/components/searchBar';
import {parseAddress, getImageRange} from 'app/components/events/interfaces/utils';
import ImageForBar from 'app/components/events/interfaces/imageForBar';
import {t, tct} from 'app/locale';
import ClippedBox from 'app/components/clippedBox';
import {Organization, Project, Event, Frame} from 'app/types';

import DebugImage from './debugImage';
import ImageIcon from './imageIcon';

const MIN_FILTER_LEN = 3;
const MAX_HEIGHT = 600;

function getFileName(path) {
  const directorySeparator = /^([a-z]:\\|\\\\)/i.test(path) ? '\\' : '/';
  return path.split(directorySeparator).pop();
}

type Image = React.ComponentProps<typeof DebugImage>['image'];

type DefaultProps = {
  data: {
    images: Array<Image>;
  };
};

type Props = DefaultProps & {
  event: Event;
  orgId: Organization['id'];
  projectId: Project['id'];
};

type State = {
  filter: string | null;
  debugImages: Array<Image>;
  filteredImages: Array<Image>;
  showUnused: boolean;
  showDetails: boolean;
  foundFrame?: Frame;
  debugImagesPanelHeight?: number;
};

const cache = new CellMeasurerCache({
  fixedWidth: true,
  defaultHeight: 100,
});

class DebugMetaInterface extends React.PureComponent<Props> {
  static defaultProps: DefaultProps = {
    data: {images: []},
  };

  state: State = {
    filter: null,
    debugImages: [],
    filteredImages: [],
    showUnused: false,
    showDetails: false,
  };

  componentDidMount() {
    this.unsubscribeFromStore = DebugMetaStore.listen(this.onStoreChange);
    this.filterImages();
  }

  componentDidUpdate(_prevProps: Props, prevState: State) {
    if (
      prevState.showUnused !== this.state.showUnused ||
      prevState.filter !== this.state.filter
    ) {
      this.filterImages();
    }
    if (prevState.filteredImages.length === 0 && this.state.filteredImages.length > 0) {
      this.getClippedBoxHeight();
    }
  }

  componentWillUnmount() {
    if (this.unsubscribeFromStore) {
      this.unsubscribeFromStore();
    }
  }

  unsubscribeFromStore: any;
  debugImagesPanelRef = React.createRef<HTMLDivElement>();

  getClippedBoxHeight() {
    this.setState({
      debugImagesPanelHeight: this.debugImagesPanelRef?.current?.offsetHeight,
    });
  }

  filterImages() {
    // skip null values indicating invalid debug images
    const debugImages = this.getDebugImages();
    const filteredImages = debugImages.filter(image => this.filterImage(image));

    this.setState({debugImages, filteredImages});
  }

  getFrame() {
    const {
      event: {entries},
    } = this.props;

    const frames: Array<Frame> | undefined = entries.find(
      ({type}) => type === 'exception'
    )?.data?.values?.[0]?.stacktrace?.frames;

    const foundFrame =
      frames && frames.find(frame => frame.instructionAddr === this.state.filter);

    this.setState({
      foundFrame,
    });
  }

  onStoreChange = (store: {filter: string}) => {
    this.setState({
      filter: store.filter,
    });
  };

  filterImage(image: Image) {
    const {showUnused, filter} = this.state;

    if (!filter || filter.length < MIN_FILTER_LEN) {
      if (showUnused) {
        return true;
      }

      // A debug status of `null` indicates that this information is not yet
      // available in an old event. Default to showing the image.
      if (image.debug_status !== 'unused') {
        return true;
      }

      // An unwind status of `null` indicates that symbolicator did not unwind.
      // Ignore the status in this case.
      if (!isNil(image.unwind_status) && image.unwind_status !== 'unused') {
        return true;
      }

      return false;
    }

    // When searching for an address, check for the address range of the image
    // instead of an exact match.
    if (filter.indexOf('0x') === 0) {
      const needle = parseAddress(filter);
      if (needle > 0) {
        const [startAddress, endAddress] = getImageRange(image);
        return needle >= startAddress && needle < endAddress;
      }
    }

    return (
      // Prefix match for identifiers
      (image.code_id || '').indexOf(filter) === 0 ||
      (image.debug_id || '').indexOf(filter) === 0 ||
      // Any match for file paths
      (image.code_file || '').indexOf(filter) >= 0 ||
      (image.debug_file || '').indexOf(filter) >= 0
    );
  }

  handleChangeShowUnused = (event: React.ChangeEvent<HTMLInputElement>) => {
    const showUnused = event.target.checked;
    this.setState({showUnused});
  };

  handleShowUnused = () => {
    this.setState({showUnused: true});
  };

  handleChangeShowDetails = (event: React.ChangeEvent<HTMLInputElement>) => {
    const showDetails = event.target.checked;
    this.setState({showDetails});
  };

  handleChangeFilter = (value = '') => {
    DebugMetaActions.updateFilter(value);
  };

  isValidImage(image: Image) {
    // in particular proguard images do not have a code file, skip them
    if (image === null || image.code_file === null || image.type === 'proguard') {
      return false;
    }

    if (getFileName(image.code_file) === 'dyld_sim') {
      // this is only for simulator builds
      return false;
    }

    return true;
  }

  getDebugImages() {
    const {
      data: {images},
    } = this.props;

    // There are a bunch of images in debug_meta that are not relevant to this
    // component. Filter those out to reduce the noise. Most importantly, this
    // includes proguard images, which are rendered separately.
    const filtered = images.filter(image => this.isValidImage(image));

    // Sort images by their start address. We assume that images have
    // non-overlapping ranges. Each address is given as hex string (e.g.
    // "0xbeef").
    filtered.sort((a, b) => parseAddress(a.image_addr) - parseAddress(b.image_addr));

    return filtered;
  }

  getNoImagesMessage() {
    const {filter, showUnused, debugImages} = this.state;

    if (debugImages.length === 0) {
      return t('No loaded images available.');
    }

    if (!showUnused && !filter) {
      return tct(
        'No images are referenced in the stack trace. [toggle: Show Unreferenced]',
        {
          toggle: <Button priority="link" onClick={this.handleShowUnused} />,
        }
      );
    }

    return t('Sorry, no images match your query.');
  }

  renderToolbar() {
    const {filter, showDetails, showUnused} = this.state;
    return (
      <ToolbarWrapper>
        <Label>
          <Checkbox checked={showDetails} onChange={this.handleChangeShowDetails} />
          {t('details')}
        </Label>

        <Label>
          <Checkbox
            checked={showUnused || !!filter}
            disabled={!!filter}
            onChange={this.handleChangeShowUnused}
          />
          {t('show unreferenced')}
        </Label>
        <SearchInputWrapper>
          <StyledSearchBar
            onSearch={this.handleChangeFilter}
            placeholder={t('Search images\u2026')}
          />
        </SearchInputWrapper>
      </ToolbarWrapper>
    );
  }

  renderRow = ({index, key, parent, style}: ListRowProps) => {
    const {orgId, projectId} = this.props;
    const {filteredImages, showDetails} = this.state;

    return (
      <CellMeasurer
        cache={cache}
        columnIndex={0}
        key={key}
        parent={parent}
        rowIndex={index}
      >
        <DebugImage
          style={style}
          image={filteredImages[index]}
          orgId={orgId}
          projectId={projectId}
          showDetails={showDetails}
        />
      </CellMeasurer>
    );
  };

  renderImageList() {
    const {filteredImages, showDetails, debugImagesPanelHeight} = this.state;
    const {orgId, projectId} = this.props;

    if (!debugImagesPanelHeight) {
      return filteredImages.map(filteredImage => (
        <DebugImage
          key={filteredImage.debug_id}
          image={filteredImage}
          orgId={orgId}
          projectId={projectId}
          showDetails={showDetails}
        />
      ));
    }

    return (
      <div
        style={{
          height: debugImagesPanelHeight,
        }}
      >
        <AutoSizer>
          {({width, height}) => (
            <List
              deferredMeasurementCache={cache}
              height={height}
              overscanRowCount={10}
              rowCount={filteredImages.length}
              rowHeight={cache.rowHeight}
              rowRenderer={this.renderRow}
              width={width}
            />
          )}
        </AutoSizer>
      </div>
    );
  }

  render() {
    const {filteredImages, foundFrame} = this.state;

    return (
      <StyledEventDataSection
        type="packages"
        title={
          <GuideAnchor target="packages" position="bottom">
            <h3>{t('Images Loaded')}</h3>
          </GuideAnchor>
        }
        actions={this.renderToolbar()}
        wrapTitle={false}
        isCentered
      >
        <DebugImagesPanel forwardRef={this.debugImagesPanelRef}>
          <ClippedBox clipHeight={560}>
            {foundFrame && (
              <ImageForBar frame={foundFrame} onShowAllImages={this.handleChangeFilter} />
            )}
            {filteredImages.length > 0 ? (
              this.renderImageList()
            ) : (
              <EmptyItem>
                <ImageIcon type="muted" src="icon-circle-exclamation" />{' '}
                {this.getNoImagesMessage()}
              </EmptyItem>
            )}
          </ClippedBox>
        </DebugImagesPanel>
      </StyledEventDataSection>
    );
  }
}

export default DebugMetaInterface;

const Label = styled('label')`
  font-weight: normal;
  margin-right: 1em;
  margin-bottom: 0;

  > input {
    margin-right: 1ex;
  }
`;

const StyledEventDataSection = styled(EventDataSection)`
  @media (max-width: ${p => p.theme.breakpoints[0]}) {
    padding-bottom: ${space(4)};
  }
  /* to increase specificity */
  @media (min-width: ${p => p.theme.breakpoints[0]}) {
    padding-bottom: ${space(2)};
  }
`;

const DebugImagesPanel = styled(Panel)`
  margin-bottom: ${space(1)};
  max-height: 600px;
  overflow: hidden;
`;

const ToolbarWrapper = styled('div')`
  display: flex;
  align-items: center;
  @media (max-width: ${p => p.theme.breakpoints[0]}) {
    flex-wrap: wrap;
    margin-top: ${space(1)};
  }
`;
const SearchInputWrapper = styled('div')`
  max-width: 180px;
  display: inline-block;
  @media (max-width: ${p => p.theme.breakpoints[0]}) {
    width: 100%;
    max-width: 100%;
    margin-top: ${space(1)};
  }
`;
// TODO(matej): remove this once we refactor SearchBar to not use css classes
// - it could accept size as a prop
const StyledSearchBar = styled(SearchBar)`
  .search-input {
    height: 30px;
  }
  .search-clear-form {
    top: 5px !important;
  }
  .icon-search {
    top: 8px;
  }
`;

const EmptyItem = styled(PanelItem)`
  display: flex;
  align-items: center;
  justify-content: center;

  ${ImageIcon} {
    opacity: 0.4;
    margin-right: 1ex;
    vertical-align: text-bottom;
  }
`;
