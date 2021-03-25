import { GenericState } from '@angular-spotify/web/shared/data-access/models';
import {
  PlayerApiService,
  PlaylistApiService
} from '@angular-spotify/web/shared/data-access/spotify-api';
import {
  getPlaylist,
  getPlaylistsState,
  getPlaylistTracksById,
  getPlaylistTracksLoading,
  loadPlaylistSuccess,
  loadPlaylistTracks,
  PlaybackStore,
  RootState
} from '@angular-spotify/web/shared/data-access/store';
import { RouteUtil, SelectorUtil } from '@angular-spotify/web/util';
import { Injectable } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ComponentStore, tapResponse } from '@ngrx/component-store';
import { select, Store } from '@ngrx/store';
import { combineLatest, Observable } from 'rxjs';
import { filter, map, mergeMap, switchMap, tap, withLatestFrom } from 'rxjs/operators';

interface PlaylistState extends GenericState<SpotifyApi.PlaylistObjectFull> {
  playlistId: string;
}

type TogglePlaylistParams = {
  isPlaying: boolean;
};

type PlayTrackParams = {
  position: number;
};

@Injectable({ providedIn: 'root' })
export class PlaylistStore extends ComponentStore<PlaylistState> {
  playlist$!: Observable<SpotifyApi.PlaylistObjectSimplified | undefined>;
  tracks$!: Observable<SpotifyApi.PlaylistTrackResponse | undefined>;
  isPlaylistPlaying$!: Observable<boolean>;
  isPlaylistTracksLoading$!: Observable<boolean>;
  isCurrentPlaylistLoading$!: Observable<boolean>;
  readonly playlistId$ = this.select((s) => s.playlistId);

  get playlistContextUri() {
    return RouteUtil.getPlaylistContextUri(this.get().playlistId);
  }

  constructor(
    private playerApi: PlayerApiService,
    private playlistsApi: PlaylistApiService,
    private route: ActivatedRoute,
    private store: Store<RootState>,
    private playbackStore: PlaybackStore
  ) {
    super({
      data: null,
      error: null,
      status: 'pending',
      playlistId: ''
    });
    this.init();
  }

  init() {
    const playlistParams$: Observable<string> = this.route.params.pipe(
      map((params) => params.playlistId),
      filter((playlistId) => !!playlistId)
    );

    this.isPlaylistTracksLoading$ = this.store.select(getPlaylistTracksLoading);
    this.isCurrentPlaylistLoading$ = this.select(SelectorUtil.isLoading);

    this.playlist$ = playlistParams$.pipe(
      tap((playlistId) => {
        this.patchState({
          playlistId
        });
        this.loadPlaylist({ playlistId });
      }),
      switchMap((playlistId) => this.store.pipe(select(getPlaylist(playlistId))))
    );

    this.tracks$ = playlistParams$.pipe(
      tap((playlistId) => {
        this.store.dispatch(
          loadPlaylistTracks({
            playlistId
          })
        );
      }),
      switchMap((playlistId) => this.store.pipe(select(getPlaylistTracksById(playlistId))))
    );

    this.isPlaylistPlaying$ = SelectorUtil.getMediaPlayingState(
      combineLatest([
        this.playlist$.pipe(map((playlist) => playlist?.uri)),
        this.playbackStore.playback$
      ])
    );
  }

  readonly loadPlaylist = this.effect<{ playlistId: string }>((params$) =>
    params$.pipe(
      withLatestFrom(this.store.select(getPlaylistsState)),
      filter(([params, state]) => !state.map?.get(params.playlistId)),
      tap(() => {
        this.patchState({
          status: 'loading',
          error: null
        });
      }),
      map(([action]) => action),
      mergeMap(({ playlistId }) =>
        this.playlistsApi.getById(playlistId).pipe(
          tapResponse(
            (playlist) => {
              this.store.dispatch(
                loadPlaylistSuccess({
                  playlist
                })
              );
              this.patchState({
                status: 'success',
                error: null
              });
            },
            (e) => {
              this.patchState({
                status: 'error',
                error: e as string
              });
            }
          )
        )
      )
    )
  );

  readonly togglePlaylist = this.effect<TogglePlaylistParams>((params$) =>
    params$.pipe(
      switchMap(({ isPlaying }) =>
        this.playerApi.togglePlay(isPlaying, {
          context_uri: this.playlistContextUri
        })
      )
    )
  );

  readonly playTrack = this.effect<PlayTrackParams>((params$) =>
    params$.pipe(
      switchMap(({ position }) =>
        this.playerApi.play({
          context_uri: this.playlistContextUri,
          offset: {
            position
          }
        })
      )
    )
  );
}
